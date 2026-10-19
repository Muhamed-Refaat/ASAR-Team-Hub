/* Immediate local feedback for updates; only confirmed responses enter the source snapshot. */
const HubActions = (() => {
  function create({
    model,
    getData,
    send,
    schedule,
    accept,
    onView,
    onChange,
    onNotice,
    makeId,
    now = () => new Date().toISOString(),
  }) {
    let jobs = [];
    const projections = new WeakMap();
    let lastView;
    const active = (job) => ["queued", "saving"].includes(job.state);
    const owner = () => model.norm(getData()?.activeUserSession?.email);
    function apply(data, job) {
      const previous = projections.get(job);
      if (previous?.base === data) return previous.data;
      if (job.action === "queueTelegramNotification") {
        if (
          !model.isAdmin(data, model.actor(data, job.owner)) ||
          !job.payload.receipt
        )
          throw new Error(
            "Open the Telegram preview as an admin before sending.",
          );
        return data;
      }
      const result = model.transition(
        data,
        job.owner,
        job.action,
        job.payload,
        job.timestamp,
      );
      if (!result.unchanged) {
        const row = result.db.activity[result.db.activity.length - 1];
        const details = JSON.parse(row.Details || "{}");
        row.Details = JSON.stringify({
          ...details,
          outcome: "Saving",
          optimistic: true,
        });
      }
      projections.set(job, { base: data, data: result.db });
      return result.db;
    }
    function view() {
      let data = getData();
      if (!data) return data;
      const signature = jobs
        .filter((job) => active(job) && job.owner === owner())
        .map((job) => job.id)
        .join("|");
      if (
        lastView?.base === data &&
        lastView.owner === owner() &&
        lastView.signature === signature
      )
        return lastView.data;
      const base = data;
      for (const job of jobs) {
        if (!active(job) || job.owner !== owner()) continue;
        try {
          data = apply(data, job);
        } catch (_) {
          /* A failed dependency is handled by dispatch, without displaying a false result. */
        }
      }
      const next = model.snapshot({
        ...data,
        allTeam: data.team,
        team: model.activeTeam(data),
      });
      lastView = { base, owner: owner(), signature, data: next };
      return next;
    }
    function emit() {
      onChange(jobs.map((job) => ({ ...job })));
      onView(view());
    }
    function successMessage(job) {
      if (job.action === "completeEvent")
        return model.REVIEW_TYPES.includes(job.type)
          ? "Submission saved for admin review. Status: Pending."
          : "Completion saved.";
      return (
        {
          moveTask: "Task status saved.",
          updateSkillCompletion: "Skill result saved.",
          revertCompletion: "Status reset saved.",
          reviewSubmission: "Review saved.",
          addTaskLink: "Evidence link saved.",
          removeTaskLink: "Evidence link removed.",
          queueTelegramNotification: "Announcement queued for Telegram.",
          saveHierarchy: "Team distribution saved.",
          saveSkillRequirements: "Required skills saved.",
          removeMember: "Member removed from the active team.",
          deleteEvent: "Event deleted. History preserved.",
          addReference: "Reference link added.",
          deleteReference: "Reference link deleted.",
        }[job.action] || "Changes saved."
      );
    }
    function saved(job) {
      if (job.state === "saved") return;
      job.state = "saved";
      job.error = "";
      if (job.owner === owner()) onNotice?.(successMessage(job), "success");
      const timer = setTimeout(() => {
        jobs = jobs.filter((item) => item !== job);
        emit();
      }, 6000);
      timer?.unref?.();
    }
    function recorded(data, job) {
      return (data.activity || []).some((row) => {
        if (model.norm(row.Email) !== job.owner || row.Action !== job.action)
          return false;
        try {
          const details = JSON.parse(row.Details || "{}");
          return (
            details?.outcome === "Succeeded" && details.requestId === job.id
          );
        } catch (_) {
          return false;
        }
      });
    }
    function confirmed(data) {
      jobs.forEach((job) => {
        if (active(job) && recorded(data, job)) saved(job);
      });
      emit();
    }
    function dispatch(job) {
      schedule(async () => {
        if (!active(job)) return;
        try {
          if (owner() !== job.owner)
            throw new Error(
              "Switch back to the account that made this update before retrying.",
            );
          if (recorded(getData(), job)) {
            saved(job);
            emit();
            return;
          }
          apply(getData(), job); // Revalidate dependent updates against the latest confirmed snapshot.
          job.state = "saving";
          emit();
          const result = await send(job.action, job.payload);
          if (!result?.success)
            throw new Error(
              result?.error || "The update could not be confirmed.",
            );
          saved(job);
          accept(result.data);
        } catch (error) {
          job.state = job.replacedBy ? "superseded" : "failed";
          job.error = error.message || String(error);
          if (job.owner === owner() && job.state === "failed")
            onNotice?.(
              `Couldn’t save “${job.title}”. Open the sync indicator beside Refresh to retry.`,
              "error",
            );
          emit();
        }
      });
    }
    function mutate(action, payload) {
      const data = view();
      const currentOwner = owner();
      const id = payload.newId || makeId();
      const duplicate = jobs.find(
        (job) => job.id === id && job.owner === currentOwner,
      );
      if (duplicate) return duplicate;
      const key =
        payload.key ||
        (data.completions || []).find(
          (row) => row["Submission ID"] === payload.submissionId,
        )?.["Event ID"] ||
        "";
      const event = key
        ? model.events(data).find((item) => item.key === key)
        : null;
      const job = {
        id,
        owner: currentOwner,
        kind: "update",
        action,
        payload: { ...payload, newId: id, commandId: id },
        timestamp: now(),
        key,
        type: event?.type || "intelligence",
        title:
          event?.title ||
          payload.title ||
          (action === "saveHierarchy"
            ? "Team distribution"
            : action === "saveSkillRequirements"
              ? "Required skills"
              : "Team update"),
        state: "queued",
        error: "",
      };
      const projected = apply(data, job); // Invalid input stays in its form; no request is queued.
      if (projected === data && action !== "queueTelegramNotification")
        return null;
      if (
        [
          "moveTask",
          "saveTask",
          "saveEvent",
          "updateSkillCompletion",
          "saveHierarchy",
          "saveSkillRequirements",
        ].includes(action)
      ) {
        job.channel = `${action}:${key || payload.memberId || "team"}`;
        jobs.forEach((older) => {
          if (
            older.owner === currentOwner &&
            older.channel === job.channel &&
            older.state !== "saved"
          ) {
            older.replacedBy = id;
            if (older.state === "failed") older.state = "superseded";
            // A task can cross several columns while a previous request is in flight.
            // Only the newest status that has not started saving needs a request.
            if (action === "moveTask" && older.state === "queued")
              older.state = "superseded";
          }
        });
      }
      jobs.push(job);
      emit();
      dispatch(job);
      return job;
    }
    function retry(id) {
      const job = jobs.find((item) => item.id === id && item.owner === owner());
      if (!job || job.state !== "failed" || job.replacedBy) return;
      try {
        apply(view(), job);
      } catch (error) {
        job.error = error.message || String(error);
        emit();
        return;
      }
      job.state = "queued";
      job.error = "";
      emit();
      dispatch(job);
    }
    function dismiss(id) {
      jobs = jobs.filter(
        (job) => job.id !== id || job.owner !== owner() || active(job),
      );
      emit();
    }
    return { mutate, accept: confirmed, retry, dismiss, view };
  }
  return { create };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = HubActions;
