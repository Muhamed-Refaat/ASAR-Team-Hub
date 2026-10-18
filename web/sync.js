/* Serialize requests and keep event drafts separate from confirmed server data. */
const HubSync = (() => {
  function create({
    model,
    getData,
    send,
    onData,
    onChange,
    onNotice,
    storage,
    makeId,
    now = () => new Date().toISOString(),
  }) {
    let tail = Promise.resolve();
    let jobs = [];
    let restored = false;
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
      const result = tail.then(task);
      tail = result.catch(() => {});
      return result;
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
      job.event = model
        .events(result.db)
        .find((event) => event.type === job.type && event.id === eventId(job));
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
              `Couldn’t confirm “${job.payload.title}”. Your draft is kept in Event saves.`,
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
    return { run, accept, enqueue, retry, dismiss, restore };
  }
  return { create };
})();
if (typeof module !== "undefined" && module.exports) module.exports = HubSync;
