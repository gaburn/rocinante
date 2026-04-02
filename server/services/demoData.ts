import { Session, SubAgent, TimelineEvent, SessionStatus, AgentStatus } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

let _eventCounter = 0;
function eventId(): string {
  return `demo-ev-${++_eventCounter}`;
}

function makeAgent(
  name: string,
  status: AgentStatus,
  startedMinAgo: number,
  completedMinAgo?: number,
  children: SubAgent[] = [],
): SubAgent {
  return {
    id: `agent-${name.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    status,
    task: name,
    startedAt: minutesAgo(startedMinAgo),
    ...(completedMinAgo !== undefined ? { completedAt: minutesAgo(completedMinAgo) } : {}),
    children,
  };
}

function makeTimeline(count: number, startMinAgo: number): TimelineEvent[] {
  const types = [
    'user.message',
    'assistant.message',
    'tool.call',
    'tool.result',
    'agent.spawn',
    'agent.complete',
    'file.edit',
    'file.create',
    'shell.command',
  ];
  const summaries: Record<string, string[]> = {
    'user.message': ['User sent a follow-up message', 'User clarified requirements', 'User approved changes'],
    'assistant.message': ['Analyzing the codebase...', 'Implementing requested changes', 'Running tests to verify'],
    'tool.call': ['Reading file contents', 'Searching for references', 'Executing shell command'],
    'tool.result': ['File read successfully', 'Found 3 matching references', 'Command completed'],
    'agent.spawn': ['Spawned sub-agent for analysis', 'Delegated task to explore agent', 'Started code-review agent'],
    'agent.complete': ['Sub-agent finished analysis', 'Explore agent returned results', 'Review complete'],
    'file.edit': ['Updated component logic', 'Fixed import statement', 'Refactored helper function'],
    'file.create': ['Created new test file', 'Generated config file', 'Added utility module'],
    'shell.command': ['Ran npm install', 'Executed test suite', 'Built the project'],
  };

  const events: TimelineEvent[] = [];
  const step = startMinAgo / count;

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const typeSummaries = summaries[type] ?? ['Processing...'];
    events.push({
      id: eventId(),
      type,
      timestamp: minutesAgo(startMinAgo - i * step),
      parentId: null,
      summary: typeSummaries[i % typeSummaries.length],
    });
  }

  return events;
}

function makeBuckets(): number[] {
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 6));
}

// ---------------------------------------------------------------------------
// Session definitions
// ---------------------------------------------------------------------------

interface DemoSessionDef {
  id: string;
  name: string;
  status: SessionStatus;
  agentCount: number;
  latestUserMessage: string;
  assistantUpdates: string[];
  branch: string;
  startedMinAgo: number;
  lastActivityMinAgo: number;
  blockedReason?: string;
  waitingFor?: string;
}

const DEFS: DemoSessionDef[] = [
  // -- Storefront UI --
  {
    id: 'demo-storefront-catalog-a1b2c3',
    name: 'Build product catalog page',
    status: 'active',
    agentCount: 8,
    latestUserMessage: 'Add filtering by category and price range to the product grid',
    assistantUpdates: [
      'Setting up the filter component with debounced search...',
      'Product grid now supports category filtering. Working on price range slider next.',
    ],
    branch: 'feature/product-catalog',
    startedMinAgo: 210,
    lastActivityMinAgo: 3,
  },
  {
    id: 'demo-storefront-cart-d4e5f6',
    name: 'Add shopping cart with Stripe checkout',
    status: 'active',
    agentCount: 12,
    latestUserMessage: 'Wire up the Stripe payment intent on the server side',
    assistantUpdates: [
      'Payment intent endpoint is live. Connecting the frontend checkout form now.',
    ],
    branch: 'feature/stripe-checkout',
    startedMinAgo: 180,
    lastActivityMinAgo: 7,
  },
  {
    id: 'demo-storefront-mobile-g7h8i9',
    name: 'Fix responsive layout on mobile',
    status: 'completed',
    agentCount: 3,
    latestUserMessage: 'The nav menu overlaps the hero section on iPhone SE',
    assistantUpdates: [
      'Fixed. Nav now collapses to hamburger below 640px. Tested on SE, Mini, and Pro Max.',
    ],
    branch: 'fix/mobile-responsive',
    startedMinAgo: 200,
    lastActivityMinAgo: 45,
  },
  {
    id: 'demo-storefront-darkmode-j0k1l2',
    name: 'Design dark mode theme',
    status: 'completed',
    agentCount: 5,
    latestUserMessage: 'Make sure the chart colors work in both themes',
    assistantUpdates: [
      'All chart colors now use CSS variables. Dark mode tested across all 12 chart types.',
    ],
    branch: 'feature/dark-mode',
    startedMinAgo: 230,
    lastActivityMinAgo: 90,
  },
  // -- Payments API --
  {
    id: 'demo-payments-webhook-m3n4o5',
    name: 'Implement webhook handler for Stripe events',
    status: 'active',
    agentCount: 6,
    latestUserMessage: 'Handle payment_intent.succeeded and payment_intent.payment_failed events',
    assistantUpdates: [
      'Webhook handler registered. Processing succeeded events with idempotency checks.',
    ],
    branch: 'feature/stripe-webhooks',
    startedMinAgo: 150,
    lastActivityMinAgo: 5,
  },
  {
    id: 'demo-payments-ratelimit-p6q7r8',
    name: 'Add rate limiting to payment endpoints',
    status: 'blocked',
    agentCount: 4,
    latestUserMessage: 'Use a sliding window rate limiter, 100 requests per minute per API key',
    assistantUpdates: [
      'Rate limiter logic is ready but needs Redis. Blocked on connection config.',
    ],
    branch: 'feature/rate-limiting',
    startedMinAgo: 120,
    lastActivityMinAgo: 20,
    blockedReason: 'Waiting for Redis connection config from DevOps',
  },
  {
    id: 'demo-payments-refund-s9t0u1',
    name: 'Write integration tests for refund flow',
    status: 'waiting',
    agentCount: 2,
    latestUserMessage: 'Test the full refund lifecycle: initiate, process, confirm, with edge cases',
    assistantUpdates: [
      'Test scaffolding ready. Waiting for webhook handler to land before running.',
    ],
    branch: 'test/refund-flow',
    startedMinAgo: 100,
    lastActivityMinAgo: 15,
    waitingFor: 'Webhook handler to be completed first',
  },
  // -- Mobile App --
  {
    id: 'demo-mobile-expo-v2w3x4',
    name: 'Set up React Native project with Expo',
    status: 'completed',
    agentCount: 4,
    latestUserMessage: 'Initialize the project with TypeScript, ESLint, and navigation',
    assistantUpdates: [
      'Project bootstrapped with Expo SDK 52, TypeScript strict mode, and React Navigation.',
    ],
    branch: 'feature/expo-init',
    startedMinAgo: 240,
    lastActivityMinAgo: 110,
  },
  {
    id: 'demo-mobile-onboarding-y5z6a7',
    name: 'Build onboarding flow with biometric auth',
    status: 'active',
    agentCount: 9,
    latestUserMessage: 'Add Face ID / fingerprint authentication after the welcome screens',
    assistantUpdates: [
      'Welcome carousel done. Integrating expo-local-authentication for biometrics now.',
    ],
    branch: 'feature/onboarding-biometrics',
    startedMinAgo: 160,
    lastActivityMinAgo: 2,
  },
  {
    id: 'demo-mobile-push-b8c9d0',
    name: 'Push notification service integration',
    status: 'blocked',
    agentCount: 5,
    latestUserMessage: 'Set up push notifications with Firebase Cloud Messaging',
    assistantUpdates: [
      'FCM setup complete for Android. iOS blocked on APNs certificate.',
    ],
    branch: 'feature/push-notifications',
    startedMinAgo: 130,
    lastActivityMinAgo: 25,
    blockedReason: 'Missing APNs certificate from Apple Developer account',
  },
  // -- Ungrouped --
  {
    id: 'demo-ci-monorepo-e1f2g3',
    name: 'Update CI pipeline for monorepo',
    status: 'active',
    agentCount: 3,
    latestUserMessage: 'Add parallel test jobs for each workspace in the monorepo',
    assistantUpdates: [
      'CI config updated. Tests now run in parallel across 4 workspace shards.',
    ],
    branch: 'chore/ci-parallel-tests',
    startedMinAgo: 90,
    lastActivityMinAgo: 10,
  },
  {
    id: 'demo-audit-deps-h4i5j6',
    name: 'Audit npm dependencies for security',
    status: 'completed',
    agentCount: 2,
    latestUserMessage: 'Run npm audit and fix any high/critical vulnerabilities',
    assistantUpdates: [
      'Audit complete. Fixed 3 high-severity issues. No critical vulnerabilities remaining.',
    ],
    branch: 'chore/npm-audit',
    startedMinAgo: 170,
    lastActivityMinAgo: 60,
  },
];

// ---------------------------------------------------------------------------
// Build full Session objects from the definitions
// ---------------------------------------------------------------------------

function agentStatusFor(sessionStatus: SessionStatus): AgentStatus {
  switch (sessionStatus) {
    case 'active': return 'running';
    case 'blocked': return 'blocked';
    case 'waiting': return 'waiting';
    case 'completed': return 'completed';
  }
}

function buildAgentTree(sessionStatus: SessionStatus, agentCount: number, startMinAgo: number): SubAgent {
  const rootStatus = agentStatusFor(sessionStatus);
  const isDone = sessionStatus === 'completed';

  const childNames = [
    'Analyzing project structure',
    'Reading existing code',
    'Implementing changes',
    'Running test suite',
    'Reviewing code quality',
    'Updating documentation',
    'Checking dependencies',
    'Validating types',
    'Building project',
    'Deploying changes',
  ];

  const children: SubAgent[] = [];
  const childCount = Math.min(agentCount - 1, 4);

  for (let i = 0; i < childCount; i++) {
    const childDone = isDone || i < childCount - 1;
    const childStatus: AgentStatus = childDone ? 'completed' : rootStatus;
    const childStartMin = startMinAgo - (i + 1) * 10;
    const grandchildren: SubAgent[] = [];

    // Give first two children a grandchild each
    if (i < 2 && agentCount > 4) {
      grandchildren.push(
        makeAgent(
          childNames[(i + childCount) % childNames.length],
          childDone ? 'completed' : rootStatus,
          childStartMin - 5,
          childDone ? childStartMin - 15 : undefined,
        ),
      );
    }

    children.push(
      makeAgent(
        childNames[i % childNames.length],
        childStatus,
        childStartMin,
        childDone ? childStartMin - 20 : undefined,
        grandchildren,
      ),
    );
  }

  return makeAgent(
    'Orchestrator',
    rootStatus,
    startMinAgo,
    isDone ? startMinAgo - 30 : undefined,
    children,
  );
}

function buildSession(def: DemoSessionDef): Session {
  return {
    id: def.id,
    name: def.name,
    intent: def.name,
    status: def.status,
    startedAt: minutesAgo(def.startedMinAgo),
    lastActivityAt: minutesAgo(def.lastActivityMinAgo),
    rootAgent: buildAgentTree(def.status, def.agentCount, def.startedMinAgo),
    events: makeTimeline(8, def.startedMinAgo),
    activityBuckets: makeBuckets(),
    latestUserMessage: def.latestUserMessage,
    assistantUpdates: def.assistantUpdates,
    cwd: '/home/dev/projects/acme-app',
    repository: 'acme-corp/acme-app',
    branch: def.branch,
    blockedReason: def.blockedReason,
    waitingFor: def.waitingFor,
    errorDetails: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateDemoSessions(): Session[] {
  _eventCounter = 0;
  return DEFS.map(buildSession);
}

export function getDemoWorkstreams(): Record<string, string[]> {
  return {
    'Storefront UI': DEFS
      .filter(d => ['Build product catalog page', 'Add shopping cart with Stripe checkout',
        'Fix responsive layout on mobile', 'Design dark mode theme'].includes(d.name))
      .map(d => d.id),
    'Payments API': DEFS
      .filter(d => ['Implement webhook handler for Stripe events', 'Add rate limiting to payment endpoints',
        'Write integration tests for refund flow'].includes(d.name))
      .map(d => d.id),
    'Mobile App': DEFS
      .filter(d => ['Set up React Native project with Expo', 'Build onboarding flow with biometric auth',
        'Push notification service integration'].includes(d.name))
      .map(d => d.id),
  };
}
