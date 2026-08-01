import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull().unique(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  status: text('status', { enum: ['healthy', 'degraded', 'broken', 'disabled'] })
    .notNull()
    .default('healthy'),
  pluginPath: text('plugin_path'),
  isBuiltIn: integer('is_built_in', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const adapterVersions = sqliteTable('adapter_versions', {
  id: text('id').primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  rules: text('rules').notNull(),
  downloadStrategy: text('download_strategy', {
    enum: ['direct', 'html', 'browser', 'redirect']
  })
    .notNull()
    .default('html'),
  successRate: real('success_rate').notNull().default(100),
  totalAttempts: integer('total_attempts').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  lastTested: integer('last_tested', { mode: 'timestamp_ms' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['install', 'download', 'analyze'] }).notNull(),
  url: text('url').notNull(),
  status: text('status', {
    enum: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']
  })
    .notNull()
    .default('queued'),
  progress: real('progress').notNull().default(0),
  currentStep: text('current_step'),
  totalSteps: integer('total_steps').notNull().default(7),
  sourceId: text('source_id').references(() => sources.id),
  deviceId: text('device_id').references(() => devices.id),
  context: text('context'),
  result: text('result'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const downloads = sqliteTable('downloads', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  sha256: text('sha256'),
  mimeType: text('mime_type'),
  packageType: text('package_type', { enum: ['apk', 'xapk', 'apks', 'split_bundle'] }),
  packageName: text('package_name'),
  versionName: text('version_name'),
  status: text('status', { enum: ['downloading', 'completed', 'failed', 'deleted'] })
    .notNull()
    .default('downloading'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const installedApps = sqliteTable('installed_apps', {
  id: text('id').primaryKey(),
  packageName: text('package_name').notNull(),
  versionName: text('version_name'),
  versionCode: integer('version_code'),
  sha256: text('sha256'),
  certificate: text('certificate'),
  architecture: text('architecture'),
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
  downloadId: text('download_id').references(() => downloads.id, { onDelete: 'set null' }),
  installedAt: integer('installed_at', { mode: 'timestamp_ms' }).notNull()
})

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  serial: text('serial').notNull().unique(),
  model: text('model'),
  manufacturer: text('manufacturer'),
  androidVersion: text('android_version'),
  architecture: text('architecture'),
  status: text('status', { enum: ['online', 'offline', 'unauthorized'] })
    .notNull()
    .default('offline'),
  isPreferred: integer('is_preferred', { mode: 'boolean' }).notNull().default(false),
  lastSeen: integer('last_seen', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).notNull(),
  source: text('source').notNull(),
  message: text('message').notNull(),
  metadata: text('metadata'),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type Source = typeof sources.$inferSelect
export type NewSource = typeof sources.$inferInsert
export type AdapterVersion = typeof adapterVersions.$inferSelect
export type NewAdapterVersion = typeof adapterVersions.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Download = typeof downloads.$inferSelect
export type NewDownload = typeof downloads.$inferInsert
export type InstalledApp = typeof installedApps.$inferSelect
export type NewInstalledApp = typeof installedApps.$inferInsert
export type Device = typeof devices.$inferSelect
export type NewDevice = typeof devices.$inferInsert
export type Log = typeof logs.$inferSelect
export type NewLog = typeof logs.$inferInsert
export type Setting = typeof settings.$inferSelect
