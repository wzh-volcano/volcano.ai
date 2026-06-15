export interface Task {
  id: string;
  text: string;
  time: string;
  active?: boolean;
}

export interface TaskGroup {
  title: string;
  tasks: Task[];
}

export interface MessageAction {
  type: 'search' | 'run' | 'write' | 'update';
  label: string;
  code?: string;
  files?: { name: string; type: 'html' | 'js' | 'css' | 'other' }[];
  diffAdd?: number;
  diffDel?: number;
}

export interface Message {
  id: string;
  type: 'action' | 'text';
  content?: string;
  action?: MessageAction;
}

export interface GitChange {
  label: string;
  add?: number;
  del?: number;
}

export interface ProgressItem {
  text: string;
  done: boolean;
}

export interface KnowledgeBaseFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  files: KnowledgeBaseFile[];
}
