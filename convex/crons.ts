import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Publish scheduled modules whose time has come.
crons.interval("publish scheduled modules", { minutes: 5 }, internal.modules.publishDue, {});

export default crons;
