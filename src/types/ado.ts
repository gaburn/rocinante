export interface AdoReviewer {
  displayName: string;
  vote: number; // -10=rejected, -5=waiting, 0=none, 5=approved-with-suggestions, 10=approved
}

export interface AdoWorkItem {
  id: number;
  title: string;
  state: string; // "New", "Active", "Resolved", "Closed"
  assignedTo: string | null;
  workItemType: string; // "User Story", "Bug", "Task"
  url: string;
}

export interface AdoPullRequest {
  id: number;
  title: string;
  status: 'active' | 'draft' | 'completed' | 'abandoned';
  sourceBranch: string;
  targetBranch: string;
  repositoryId?: string;
  repositoryName: string;
  createdBy: string;
  reviewers: AdoReviewer[];
  url: string;
}

export interface AdoStatus {
  configured: boolean;
  organization: string;
  project: string;
}

export interface SessionDeliverables {
  pullRequests: AdoPullRequest[];
  workItems: AdoWorkItem[];
}

export interface SessionDeliverables {
  pullRequests: AdoPullRequest[];
  workItems: AdoWorkItem[];
}
