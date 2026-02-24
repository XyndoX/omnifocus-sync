export interface OFTask {
	id: string;
	name: string;
	note: string | null;
	completed: boolean;
	completionDate: string | null;
	dueDate: string | null;
	deferDate: string | null;
	flagged: boolean;
	estimatedMinutes: number | null;
	taskStatus: string;
	projectId: string | null;
	projectName: string | null;
	tags: OFTagRef[];
	added: string | null;
	modified: string | null;
}

export interface OFTagRef {
	id: string;
	name: string;
}

export interface OFProject {
	id: string;
	name: string;
	note: string | null;
	status: "active" | "onHold" | "completed" | "dropped";
	dueDate: string | null;
	deferDate: string | null;
	sequential: boolean;
	folderName: string | null;
}

export interface OFTag {
	id: string;
	name: string;
	parentName: string | null;
	active: boolean;
}

export interface SyncResult {
	projects: ProjectWithTasks[];
	inboxTasks: OFTask[];
	tags: OFTag[];
	syncedAt: string;
}

export interface ProjectWithTasks extends OFProject {
	tasks: OFTask[];
}

export interface PluginSettings {
	syncFolderPath: string;
	tagPrefix: string;
	showDueDate: boolean;
	showTags: boolean;
	showEstimate: boolean;
	showOFLink: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	syncFolderPath: "OmniFocus",
	tagPrefix: "of",
	showDueDate: true,
	showTags: true,
	showEstimate: true,
	showOFLink: false,
};

export interface IDMap {
	tasks: Record<string, string>;
	projects: Record<string, string>;
}

export interface CacheData {
	syncedAt: string;
	projects: ProjectWithTasks[];
	inboxTasks: OFTask[];
	tags: OFTag[];
}
