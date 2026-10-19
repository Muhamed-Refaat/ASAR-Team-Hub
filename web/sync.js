/* Serialize requests and keep event drafts separate from confirmed server data. */
const HubSync = (() => {
  function create({
    model,
    getData,
    send,
    onData,
    onChange,
    onNotice,
    onReadChange,
    onReadError,
    storage,
    makeId,
    now = () => new Date().toISOString(),
  }) {
    let tail = Promise.resolve();
    let jobs = [];
    let restored = false;
    let pendingWrites = 0;
    let epoch = 0;
    let readPromise = null;
    let deferredRead = null;
    const storageKey = "asar_event_drafts_v1";
    const owner = () => model.norm(getData()?.activeUserSession?.email);
    const eventId = (job) => job.type.toLowerCase() + "-" + job.payload.newId;
    const exists = (job, data) =>
      (data?.[model.TABLES[job.type]] || []).some(
        (row) => model.id(row["Event ID"]) === eventId(job),
      );
    const emit = () => {
      try {
        storage?.setItem(
          storageKey,
          JSON.stringify(
            jobs
              .filter((job) => job.state !== "saved")
              .map(({ id, owner, action, payload, type }) => ({
                id,
                owner,
                action,
                payload,
                type,
              })),
          ),
        );
      } catch (_) {
        /* Memory still retains drafts when browser storage is unavailable. */
      }
      onChange(jobs.map((job) => ({ ...job })));
    };
    const run = (task) => {
      pendingWrites++;
      epoch++;
      const result = tail.then(task);
      tail = result.catch(() => {});
      const finish = () => {
        pendingWrites--;
        epoch++;
        if (!pendingWrites && deferredRead && !readPromise)
          refresh(deferredRead).catch((error) => onReadError?.(error));
      };
      result.then(finish, finish);
      return result;
    };
    // Reads never occupy the write queue. A read overlapping a write is discarded
    // and refreshed after the queue drains, so it cannot rewind confirmed data.
    const refresh = (read) => {
      if (pendingWrites || readPromise) {
        if (pendingWrites) deferredRead = read;
        return readPromise || Promise.resolve({ deferred: true });
      }
      deferredRead = null;
      const started = epoch;
      onReadChange?.(true);
      readPromise = Promise.resolve()
        .then(read)
        .then((data) => {
          if (pendingWrites || started !== epoch) {
            deferredRead = read;
            return { deferred: true };
          }
          accept(data);
          return { accepted: true };
        })
        .finally(() => {
          readPromise = null;
          onReadChange?.(false);
          if (!pendingWrites && deferredRead)
            refresh(deferredRead).catch((error) => onReadError?.(error));
        });
      return readPromise;
    };
    const saved = (job) => {
      if (job.state === "saved") return;
      job.state = "saved";
      job.error = "";
      if (job.owner === owner())
        onNotice?.(`Saved “${job.payload.title}”.`, "success");
      const timer = setTimeout(() => {
        jobs = jobs.filter((item) => item !== job);
        emit();
      }, 8000);
      timer?.unref?.();
    };
    const accept = (data) => {
      if (data?.mode === "patch") {
        if (!getData() || model.norm(data.activeUserSession?.email) !== owner())
          throw new Error(
            "The account changed. Refresh before making more updates.",
          );
        data = {
          ...getData(),
          ...data.tables,
          activeUserSession: data.activeUserSession,
          ...(data.telegram ? { telegram: data.telegram } : {}),
        };
      }
      model.snapshot(data);
      onData(data);
      if (!restored) restore();
      jobs.forEach((job) => {
        if (exists(job, data)) saved(job);
      });
      emit();
    };
    const preview = (job) => {
      const result = model.transition(
        getData(),
        job.owner,
        job.action,
        job.payload,
        now(),
      );
      job.event = model.eventByKey(result.db, `${job.type}:${eventId(job)}`);
    };
    const dispatch = (job) =>
      run(async () => {
        if (job.state === "saved") return;
        try {
          if (owner() !== job.owner)
            throw new Error(
              "Switch back to the account that created this draft to retry.",
            );
          if (exists(job, getData())) {
            saved(job);
            emit();
            return;
          }
          job.state = "saving";
          emit();
          const result = await send(job.action, job.payload);
          if (!result?.success)
            throw new Error(
              result?.error || "The save could not be confirmed.",
            );
          accept(result.data);
          if (job.state !== "saved")
            throw new Error(
              "The save could not be confirmed. Refresh or retry.",
            );
        } catch (error) {
          job.state = "failed";
          job.error = error.message || String(error);
          if (job.owner === owner())
            onNotice?.(
              `Couldn’t confirm “${job.payload.title}”. Your draft is kept; open the sync indicator beside Refresh to retry.`,
              "error",
            );
          emit();
        }
      });
    const enqueue = (action, payload) => {
      const type = action === "saveTask" ? "Task" : payload.type;
      if (
        !["saveTask", "saveEvent"].includes(action) ||
        !model.EVENT_FORM_FIELDS[type] ||
        payload.key
      )
        throw new Error("Only new events can be saved in the background.");
      const id = payload.newId || makeId();
      const currentOwner = owner();
      const duplicate = jobs.find(
        (job) => job.id === id && job.owner === currentOwner,
      );
      if (duplicate) return duplicate;
      const job = {
        id,
        owner: currentOwner,
        type,
        action,
        payload: { ...payload, newId: id },
        state: "queued",
        error: "",
      };
      preview(job); // Validate immediately; invalid forms stay open without a network request.
      jobs = [
        ...jobs
          .filter((item) => item.state !== "saved")
          .concat(jobs.filter((item) => item.state === "saved").slice(-3)),
        job,
      ];
      emit();
      dispatch(job);
      return job;
    };
    const retry = (id) => {
      const job = jobs.find((item) => item.id === id && item.owner === owner());
      if (!job || job.state !== "failed") return;
      try {
        preview(job);
      } catch (error) {
        job.error = error.message || String(error);
        emit();
        return;
      }
      job.state = "queued";
      job.error = "";
      emit();
      dispatch(job);
    };
    const restore = () => {
      if (restored) return;
      restored = true;
      let drafts;
      try {
        drafts = JSON.parse(storage?.getItem(storageKey) || "[]");
      } catch (_) {
        return;
      }
      if (!Array.isArray(drafts)) return;
      for (const draft of drafts) {
        if (
          !draft?.payload ||
          !model.EVENT_FORM_FIELDS[draft.type] ||
          !["saveTask", "saveEvent"].includes(draft.action) ||
          draft.payload.key ||
          !draft.payload.newId ||
          draft.id !== draft.payload.newId
        )
          continue;
        const job = {
          ...draft,
          state: "failed",
          error: "Save not confirmed after reload. Retry or refresh to check.",
        };
        if (job.owner === owner()) {
          try {
            preview(job);
          } catch (_) {
            /* Retain the submitted fields even if assignments have changed. */
          }
        }
        jobs.push(job);
        if (exists(job, getData())) saved(job);
      }
      emit();
    };
    const dismiss = (id) => {
      jobs = jobs.filter(
        (job) =>
          job.id !== id ||
          job.owner !== owner() ||
          ["queued", "saving"].includes(job.state),
      );
      emit();
    };
    return { run, refresh, accept, enqueue, retry, dismiss, restore };
  }
  return { create };
})();
if (typeof module !== "undefined" && module.exports) module.exports = HubSync;
