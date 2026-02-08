import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Job CRUD operations
 */

// List all jobs
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("jobs").collect();
  },
});

// List jobs by worker type
export const listByType = query({
  args: {
    workerType: v.union(
      v.literal("exec"),
      v.literal("ai"),
      v.literal("skill")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_worker_type", (q) => q.eq("workerType", args.workerType))
      .collect();
  },
});

// Get single job by ID
export const get = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get("jobs", args.id);
  },
});

// Get job by name
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

// Create new job
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    workerType: v.union(
      v.literal("exec"),
      v.literal("ai"),
      v.literal("skill")
    ),
    config: v.object({
      // exec-worker
      command: v.optional(v.string()),
      cwd: v.optional(v.string()),
      timeout: v.optional(v.number()),
      shell: v.optional(v.union(
        v.literal("powershell"),
        v.literal("bash"),
        v.literal("cmd")
      )),
      // ai-worker
      prompt: v.optional(v.string()),
      model: v.optional(v.string()),
      maxTokens: v.optional(v.number()),
      temperature: v.optional(v.number()),
      repoOwner: v.optional(v.string()),
      repoName: v.optional(v.string()),
      // skill-worker
      skillName: v.optional(v.string()),
      action: v.optional(v.string()),
      params: v.optional(v.any()),
    }),
    inputParams: v.optional(v.array(v.object({
      name: v.string(),
      type: v.union(
        v.literal("string"),
        v.literal("number"),
        v.literal("boolean")
      ),
      defaultValue: v.optional(v.any()),
      required: v.boolean(),
      description: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    // Check for duplicate name
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    
    if (existing) {
      throw new Error(`Job with name "${args.name}" already exists`);
    }

    const now = Date.now();
    const id = await ctx.db.insert("jobs", {
      name: args.name,
      description: args.description,
      workerType: args.workerType,
      config: args.config,
      inputParams: args.inputParams,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

// Update existing job
export const update = mutation({
  args: {
    id: v.id("jobs"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    workerType: v.optional(v.union(
      v.literal("exec"),
      v.literal("ai"),
      v.literal("skill")
    )),
    config: v.optional(v.object({
      command: v.optional(v.string()),
      cwd: v.optional(v.string()),
      timeout: v.optional(v.number()),
      shell: v.optional(v.union(
        v.literal("powershell"),
        v.literal("bash"),
        v.literal("cmd")
      )),
      prompt: v.optional(v.string()),
      model: v.optional(v.string()),
      maxTokens: v.optional(v.number()),
      temperature: v.optional(v.number()),
      repoOwner: v.optional(v.string()),
      repoName: v.optional(v.string()),
      skillName: v.optional(v.string()),
      action: v.optional(v.string()),
      params: v.optional(v.any()),
    })),
    inputParams: v.optional(v.array(v.object({
      name: v.string(),
      type: v.union(
        v.literal("string"),
        v.literal("number"),
        v.literal("boolean")
      ),
      defaultValue: v.optional(v.any()),
      required: v.boolean(),
      description: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const existing = await ctx.db.get("jobs", id);
    if (!existing) {
      throw new Error(`Job ${id} not found`);
    }

    // If renaming, check for duplicates
    if (updates.name && updates.name !== existing.name) {
      const duplicate = await ctx.db
        .query("jobs")
        .withIndex("by_name", (q) => q.eq("name", updates.name!))
        .first();
      
      if (duplicate) {
        throw new Error(`Job with name "${updates.name}" already exists`);
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.workerType !== undefined) updateData.workerType = updates.workerType;
    if (updates.config !== undefined) updateData.config = updates.config;
    if (updates.inputParams !== undefined) updateData.inputParams = updates.inputParams;

    await ctx.db.patch("jobs", id, updateData);
    return id;
  },
});

// Delete job (and associated schedules)
export const remove = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("jobs", args.id);
    if (!existing) {
      throw new Error(`Job ${args.id} not found`);
    }

    // Delete associated schedules
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_job", (q) => q.eq("jobId", args.id))
      .collect();

    for (const schedule of schedules) {
      await ctx.db.delete("schedules", schedule._id);
    }

    await ctx.db.delete("jobs", args.id);
    return args.id;
  },
});
