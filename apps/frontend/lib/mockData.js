// ============================================================
// CodeArena mock / future UI data
// Contest, question, and submission screens until those APIs exist.
// Not live authentication data. No passwords.
// ============================================================

// ---------- Users ----------
export const users = [
  { id: 'admin-1', username: 'admin', name: 'Dr. Rajesh Kumar', role: 'admin', email: 'admin@example.invalid' },
  { id: 'student-1', username: 'student1', name: 'Aarav Sharma', role: 'student', email: 'aarav@example.invalid', rollNo: 'CS2021001' },
  { id: 'student-2', username: 'student2', name: 'Priya Patel', role: 'student', email: 'priya@example.invalid', rollNo: 'CS2021002' },
  { id: 'student-3', username: 'student3', name: 'Vikram Singh', role: 'student', email: 'vikram@example.invalid', rollNo: 'CS2021003' },
  { id: 'student-4', username: 'student4', name: 'Ananya Gupta', role: 'student', email: 'ananya@example.invalid', rollNo: 'CS2021004' },
  { id: 'student-5', username: 'student5', name: 'Rohan Mehta', role: 'student', email: 'rohan@example.invalid', rollNo: 'CS2021005' },
  { id: 'student-6', username: 'student6', name: 'Sneha Reddy', role: 'student', email: 'sneha@example.invalid', rollNo: 'CS2021006' },
  { id: 'student-7', username: 'student7', name: 'Arjun Nair', role: 'student', email: 'arjun@example.invalid', rollNo: 'CS2021007' },
  { id: 'student-8', username: 'student8', name: 'Kavya Iyer', role: 'student', email: 'kavya@example.invalid', rollNo: 'CS2021008' },
];

// ---------- Questions ----------
export const questions = [
  {
    id: 'q1',
    title: 'Two Sum',
    difficulty: 'easy',
    description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
    inputFormat: 'First line contains N (size of array) and target.\nSecond line contains N space-separated integers.',
    outputFormat: 'Print two space-separated indices (0-indexed).',
    constraints: '2 ≤ N ≤ 10⁴\n-10⁹ ≤ nums[i] ≤ 10⁹\n-10⁹ ≤ target ≤ 10⁹',
    sampleInput: '4 9\n2 7 11 15',
    sampleOutput: '0 1',
    timeLimit: 2,
    memoryLimit: 256,
    testCases: [
      { id: 'tc1', input: '4 9\n2 7 11 15', expected: '0 1', isHidden: false },
      { id: 'tc2', input: '3 6\n3 2 4', expected: '1 2', isHidden: false },
      { id: 'tc3', input: '2 6\n3 3', expected: '0 1', isHidden: true },
      { id: 'tc4', input: '5 10\n1 2 3 4 6', expected: '3 4', isHidden: true },
    ],
    tags: ['Array', 'Hash Map'],
    createdAt: '2026-08-25T10:00:00Z',
  },
  {
    id: 'q2',
    title: 'Reverse String',
    difficulty: 'easy',
    description: 'Write a function that reverses a string. The input string is given as an array of characters.\n\nYou must do this by modifying the input array in-place with O(1) extra memory.',
    inputFormat: 'A single line containing a string S.',
    outputFormat: 'Print the reversed string.',
    constraints: '1 ≤ |S| ≤ 10⁵\nS contains only printable ASCII characters.',
    sampleInput: 'hello',
    sampleOutput: 'olleh',
    timeLimit: 1,
    memoryLimit: 256,
    testCases: [
      { id: 'tc5', input: 'hello', expected: 'olleh', isHidden: false },
      { id: 'tc6', input: 'Hannah', expected: 'hannaH', isHidden: false },
      { id: 'tc7', input: 'a', expected: 'a', isHidden: true },
    ],
    tags: ['String', 'Two Pointers'],
    createdAt: '2026-08-25T11:00:00Z',
  },
  {
    id: 'q3',
    title: 'Maximum Subarray',
    difficulty: 'medium',
    description: 'Given an integer array nums, find the subarray with the largest sum, and return its sum.\n\nA subarray is a contiguous non-empty sequence of elements within an array.',
    inputFormat: 'First line contains N (size of array).\nSecond line contains N space-separated integers.',
    outputFormat: 'Print the maximum subarray sum.',
    constraints: '1 ≤ N ≤ 10⁵\n-10⁴ ≤ nums[i] ≤ 10⁴',
    sampleInput: '9\n-2 1 -3 4 -1 2 1 -5 4',
    sampleOutput: '6',
    timeLimit: 2,
    memoryLimit: 256,
    testCases: [
      { id: 'tc8', input: '9\n-2 1 -3 4 -1 2 1 -5 4', expected: '6', isHidden: false },
      { id: 'tc9', input: '1\n1', expected: '1', isHidden: false },
      { id: 'tc10', input: '5\n5 4 -1 7 8', expected: '23', isHidden: true },
    ],
    tags: ['Array', 'Dynamic Programming', 'Divide and Conquer'],
    createdAt: '2026-08-26T09:00:00Z',
  },
  {
    id: 'q4',
    title: 'Fibonacci Number',
    difficulty: 'easy',
    description: 'The Fibonacci numbers, commonly denoted F(n) form a sequence such that each number is the sum of the two preceding ones, starting from 0 and 1.\n\nGiven n, calculate F(n).',
    inputFormat: 'A single integer N.',
    outputFormat: 'Print F(N).',
    constraints: '0 ≤ N ≤ 30',
    sampleInput: '4',
    sampleOutput: '3',
    timeLimit: 1,
    memoryLimit: 256,
    testCases: [
      { id: 'tc11', input: '4', expected: '3', isHidden: false },
      { id: 'tc12', input: '2', expected: '1', isHidden: false },
      { id: 'tc13', input: '10', expected: '55', isHidden: true },
    ],
    tags: ['Math', 'Recursion', 'Dynamic Programming'],
    createdAt: '2026-08-26T10:00:00Z',
  },
  {
    id: 'q5',
    title: 'Longest Palindromic Substring',
    difficulty: 'hard',
    description: 'Given a string s, return the longest palindromic substring in s.\n\nA palindrome is a string that reads the same forward and backward.',
    inputFormat: 'A single string S.',
    outputFormat: 'Print the longest palindromic substring. If there are multiple answers, print any one.',
    constraints: '1 ≤ |S| ≤ 1000\nS consists of only digits and English letters.',
    sampleInput: 'babad',
    sampleOutput: 'bab',
    timeLimit: 2,
    memoryLimit: 256,
    testCases: [
      { id: 'tc14', input: 'babad', expected: 'bab', isHidden: false },
      { id: 'tc15', input: 'cbbd', expected: 'bb', isHidden: false },
      { id: 'tc16', input: 'a', expected: 'a', isHidden: true },
      { id: 'tc17', input: 'racecar', expected: 'racecar', isHidden: true },
    ],
    tags: ['String', 'Dynamic Programming'],
    createdAt: '2026-08-27T08:00:00Z',
  },
  {
    id: 'q6',
    title: 'Valid Parentheses',
    difficulty: 'medium',
    description: 'Given a string s containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.',
    inputFormat: 'A single string S containing only parentheses characters.',
    outputFormat: 'Print "true" or "false".',
    constraints: '1 ≤ |S| ≤ 10⁴',
    sampleInput: '()[]{}',
    sampleOutput: 'true',
    timeLimit: 1,
    memoryLimit: 256,
    testCases: [
      { id: 'tc18', input: '()[]{}', expected: 'true', isHidden: false },
      { id: 'tc19', input: '(]', expected: 'false', isHidden: false },
      { id: 'tc20', input: '{[]}', expected: 'true', isHidden: true },
    ],
    tags: ['Stack', 'String'],
    createdAt: '2026-08-27T10:00:00Z',
  },
];

// ---------- Contests ----------
export const contests = [
  {
    id: 'contest-1',
    title: 'CodeArena Weekly Challenge #1',
    description: 'Weekly coding competition covering arrays, strings, and basic data structures. Open to all participants.',
    status: 'running',
    startTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    duration: 120,
    remainingTime: 75 * 60,
    questionIds: ['q1', 'q3', 'q5'],
    participantIds: ['student-1', 'student-2', 'student-3', 'student-4', 'student-5'],
    createdAt: '2026-08-28T08:00:00Z',
    rules: 'ACM-ICPC style scoring. Penalty time for wrong submissions.',
    maxParticipants: 50,
  },
  {
    id: 'contest-2',
    title: 'Data Structures Sprint',
    description: 'Focus on stacks, queues, and linked lists. Intermediate difficulty level.',
    status: 'scheduled',
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    duration: 90,
    remainingTime: 90 * 60,
    questionIds: ['q2', 'q4', 'q6'],
    participantIds: ['student-1', 'student-3', 'student-6', 'student-7'],
    createdAt: '2026-08-29T10:00:00Z',
    rules: 'Standard scoring with partial marks.',
    maxParticipants: 40,
  },
  {
    id: 'contest-3',
    title: 'Algorithm Masters',
    description: 'Advanced algorithmic problems. Only for experienced programmers.',
    status: 'draft',
    startTime: null,
    duration: 180,
    remainingTime: 180 * 60,
    questionIds: ['q3', 'q5'],
    participantIds: [],
    createdAt: '2026-08-30T06:00:00Z',
    rules: 'ICPC scoring. No partial marks.',
    maxParticipants: 30,
  },
  {
    id: 'contest-4',
    title: 'Beginner Bootcamp #3',
    description: 'Entry-level contest for first-year students. Focus on basic programming concepts.',
    status: 'ended',
    startTime: '2026-08-27T09:00:00Z',
    duration: 60,
    remainingTime: 0,
    questionIds: ['q1', 'q2', 'q4'],
    participantIds: ['student-1', 'student-2', 'student-4', 'student-5', 'student-6', 'student-8'],
    createdAt: '2026-08-25T14:00:00Z',
    rules: 'Standard scoring.',
    maxParticipants: 60,
  },
];

// ---------- Submissions ----------
export const submissions = [
  { id: 'sub-1', contestId: 'contest-1', questionId: 'q1', userId: 'student-1', language: 'python', code: 'def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        comp = target - num\n        if comp in seen:\n            return [seen[comp], i]\n        seen[num] = i', status: 'accepted', runtime: 45, memory: 14.2, submittedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), testsPassed: 4, totalTests: 4 },
  { id: 'sub-2', contestId: 'contest-1', questionId: 'q3', userId: 'student-1', language: 'python', code: 'def max_subarray(nums):\n    max_sum = nums[0]\n    current = nums[0]\n    for i in range(1, len(nums)):\n        current = max(nums[i], current + nums[i])\n        max_sum = max(max_sum, current)\n    return max_sum', status: 'accepted', runtime: 62, memory: 15.1, submittedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), testsPassed: 3, totalTests: 3 },
  { id: 'sub-3', contestId: 'contest-1', questionId: 'q1', userId: 'student-2', language: 'cpp', code: '#include <vector>\n#include <unordered_map>\nusing namespace std;\nvector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int,int> mp;\n    for(int i=0;i<nums.size();i++){\n        if(mp.count(target-nums[i])) return {mp[target-nums[i]],i};\n        mp[nums[i]]=i;\n    }\n    return {};\n}', status: 'accepted', runtime: 12, memory: 10.8, submittedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(), testsPassed: 4, totalTests: 4 },
  { id: 'sub-4', contestId: 'contest-1', questionId: 'q3', userId: 'student-2', language: 'cpp', code: '// Wrong approach\nint maxSubArray(vector<int>& nums) {\n    int sum = 0;\n    for(int x : nums) sum += x;\n    return sum;\n}', status: 'wrong_answer', runtime: 8, memory: 9.2, submittedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(), testsPassed: 1, totalTests: 3 },
  { id: 'sub-5', contestId: 'contest-1', questionId: 'q5', userId: 'student-3', language: 'java', code: 'class Solution {\n    public String longestPalindrome(String s) {\n        // TLE solution\n        String longest = "";\n        for(int i=0;i<s.length();i++)\n            for(int j=i;j<s.length();j++)\n                if(isPalin(s,i,j) && j-i+1>longest.length())\n                    longest = s.substring(i,j+1);\n        return longest;\n    }\n}', status: 'time_limit', runtime: 2000, memory: 45.3, submittedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), testsPassed: 2, totalTests: 4 },
  { id: 'sub-6', contestId: 'contest-1', questionId: 'q1', userId: 'student-4', language: 'javascript', code: 'function twoSum(nums, target) {\n    for(let i=0;i<nums.length;i++)\n        for(let j=i+1;j<nums.length;j++)\n            if(nums[i]+nums[j]===target) return [i,j];\n}', status: 'accepted', runtime: 120, memory: 12.5, submittedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(), testsPassed: 4, totalTests: 4 },
  { id: 'sub-7', contestId: 'contest-1', questionId: 'q1', userId: 'student-5', language: 'python', code: '# Runtime Error\ndef two_sum(nums, target):\n    return nums[target]', status: 'runtime_error', runtime: 0, memory: 0, submittedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), testsPassed: 0, totalTests: 4 },
  { id: 'sub-8', contestId: 'contest-4', questionId: 'q1', userId: 'student-1', language: 'python', code: 'pass', status: 'accepted', runtime: 35, memory: 13.1, submittedAt: '2026-08-27T09:15:00Z', testsPassed: 4, totalTests: 4 },
  { id: 'sub-9', contestId: 'contest-4', questionId: 'q2', userId: 'student-1', language: 'python', code: 'pass', status: 'accepted', runtime: 28, memory: 12.4, submittedAt: '2026-08-27T09:25:00Z', testsPassed: 3, totalTests: 3 },
  { id: 'sub-10', contestId: 'contest-4', questionId: 'q4', userId: 'student-2', language: 'cpp', code: 'pass', status: 'accepted', runtime: 5, memory: 8.1, submittedAt: '2026-08-27T09:20:00Z', testsPassed: 3, totalTests: 3 },
];

// ---------- Workers ----------
export const workers = [
  { id: 'worker-1', name: 'Worker-PC2', ip: '192.168.1.102', status: 'online', cpu: 23, memory: 45, executionsCompleted: 142, lastHeartbeat: new Date(Date.now() - 5000).toISOString(), uptime: '4h 23m' },
  { id: 'worker-2', name: 'Worker-PC3', ip: '192.168.1.103', status: 'busy', cpu: 78, memory: 72, executionsCompleted: 98, lastHeartbeat: new Date(Date.now() - 3000).toISOString(), uptime: '4h 20m' },
  { id: 'worker-3', name: 'Worker-PC4', ip: '192.168.1.104', status: 'online', cpu: 12, memory: 38, executionsCompleted: 156, lastHeartbeat: new Date(Date.now() - 8000).toISOString(), uptime: '4h 23m' },
  { id: 'worker-4', name: 'Worker-PC5', ip: '192.168.1.105', status: 'offline', cpu: 0, memory: 0, executionsCompleted: 67, lastHeartbeat: new Date(Date.now() - 300000).toISOString(), uptime: '0m' },
  { id: 'worker-5', name: 'Worker-PC6', ip: '192.168.1.106', status: 'online', cpu: 34, memory: 51, executionsCompleted: 121, lastHeartbeat: new Date(Date.now() - 4000).toISOString(), uptime: '3h 45m' },
  { id: 'worker-6', name: 'Worker-PC7', ip: '192.168.1.107', status: 'busy', cpu: 92, memory: 85, executionsCompleted: 89, lastHeartbeat: new Date(Date.now() - 2000).toISOString(), uptime: '4h 10m' },
];

// ---------- Leaderboard ----------
export const leaderboard = {
  'contest-1': [
    { userId: 'student-1', solved: 2, score: 200, penalty: 50, lastAccepted: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
    { userId: 'student-2', solved: 1, score: 100, penalty: 35, lastAccepted: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
    { userId: 'student-4', solved: 1, score: 100, penalty: 40, lastAccepted: new Date(Date.now() - 40 * 60 * 1000).toISOString() },
    { userId: 'student-3', solved: 0, score: 0, penalty: 15, lastAccepted: null },
    { userId: 'student-5', solved: 0, score: 0, penalty: 10, lastAccepted: null },
  ],
  'contest-4': [
    { userId: 'student-1', solved: 2, score: 200, penalty: 40, lastAccepted: '2026-08-27T09:25:00Z' },
    { userId: 'student-2', solved: 1, score: 100, penalty: 20, lastAccepted: '2026-08-27T09:20:00Z' },
    { userId: 'student-4', solved: 1, score: 100, penalty: 25, lastAccepted: '2026-08-27T09:30:00Z' },
    { userId: 'student-5', solved: 1, score: 100, penalty: 30, lastAccepted: '2026-08-27T09:35:00Z' },
    { userId: 'student-6', solved: 0, score: 0, penalty: 45, lastAccepted: null },
    { userId: 'student-8', solved: 0, score: 0, penalty: 0, lastAccepted: null },
  ],
};

// ---------- System Logs ----------
export const systemLogs = [
  { id: 'log-1', timestamp: new Date(Date.now() - 2000).toISOString(), level: 'info', event: 'SUBMISSION_RECEIVED', message: 'Submission sub-7 received from student-5 for question q1', source: 'Backend' },
  { id: 'log-2', timestamp: new Date(Date.now() - 5000).toISOString(), level: 'error', event: 'SUBMISSION_FAILED', message: 'Submission sub-7 failed: Runtime Error on test case 1', source: 'Worker-PC2' },
  { id: 'log-3', timestamp: new Date(Date.now() - 10000).toISOString(), level: 'success', event: 'SUBMISSION_EXECUTED', message: 'Submission sub-5 executed: Time Limit Exceeded (2000ms)', source: 'Worker-PC3' },
  { id: 'log-4', timestamp: new Date(Date.now() - 30000).toISOString(), level: 'info', event: 'SUBMISSION_RECEIVED', message: 'Submission sub-5 received from student-3 for question q5', source: 'Backend' },
  { id: 'log-5', timestamp: new Date(Date.now() - 60000).toISOString(), level: 'success', event: 'SUBMISSION_EXECUTED', message: 'Submission sub-2 accepted: All test cases passed (62ms)', source: 'Worker-PC4' },
  { id: 'log-6', timestamp: new Date(Date.now() - 120000).toISOString(), level: 'warn', event: 'WORKER_BUSY', message: 'Worker-PC7 CPU usage exceeded 90%', source: 'Monitor' },
  { id: 'log-7', timestamp: new Date(Date.now() - 180000).toISOString(), level: 'info', event: 'CONTEST_START', message: 'Contest "CodeArena Weekly Challenge #1" started', source: 'Backend' },
  { id: 'log-8', timestamp: new Date(Date.now() - 200000).toISOString(), level: 'info', event: 'USER_LOGIN', message: 'Student student-5 (Rohan Mehta) logged in from 192.168.1.45', source: 'Auth' },
  { id: 'log-9', timestamp: new Date(Date.now() - 250000).toISOString(), level: 'info', event: 'USER_LOGIN', message: 'Student student-4 (Ananya Gupta) logged in from 192.168.1.44', source: 'Auth' },
  { id: 'log-10', timestamp: new Date(Date.now() - 300000).toISOString(), level: 'error', event: 'WORKER_OFFLINE', message: 'Worker-PC5 went offline: Heartbeat timeout after 30s', source: 'Monitor' },
  { id: 'log-11', timestamp: new Date(Date.now() - 350000).toISOString(), level: 'info', event: 'WORKER_ONLINE', message: 'Worker-PC6 connected and ready', source: 'Monitor' },
  { id: 'log-12', timestamp: new Date(Date.now() - 400000).toISOString(), level: 'warn', event: 'RETRY_INITIATED', message: 'Retry initiated for submission sub-99: moved to Extra Queue', source: 'Backend' },
  { id: 'log-13', timestamp: new Date(Date.now() - 500000).toISOString(), level: 'info', event: 'CONTEST_CREATED', message: 'Contest "Algorithm Masters" created by admin', source: 'Backend' },
  { id: 'log-14', timestamp: new Date(Date.now() - 600000).toISOString(), level: 'success', event: 'RESULT_EXPORT', message: 'Results exported for contest "Beginner Bootcamp #3"', source: 'Backend' },
];

// ---------- Metrics ----------
export const metrics = {
  activeContests: 1,
  connectedParticipants: 5,
  onlineWorkers: 3,
  busyWorkers: 2,
  offlineWorkers: 1,
  contestQueueSize: 3,
  practiceQueueSize: 1,
  extraQueueSize: 0,
  totalSubmissions: 47,
  avgExecutionTime: 156,
  successfulExecutions: 38,
  failedExecutions: 9,
  submissionsPerMinute: [2, 5, 3, 7, 4, 6, 8, 3, 5, 4, 6, 2, 3, 7, 5, 4, 6, 3, 5, 8],
  executionTimesHistory: [120, 180, 95, 210, 145, 88, 165, 200, 130, 175, 92, 155, 140, 185, 110, 195, 105, 170, 135, 160],
};

// ---------- Helper Functions ----------

export function getUserById(id) {
  return users.find(u => u.id === id);
}

export function getQuestionById(id) {
  return questions.find(q => q.id === id);
}

export function getContestById(id) {
  return contests.find(c => c.id === id);
}

export function getSubmissionsForContest(contestId) {
  return submissions.filter(s => s.contestId === contestId);
}

export function getSubmissionsForUser(userId) {
  return submissions.filter(s => s.userId === userId);
}

export function getLeaderboardForContest(contestId) {
  const lb = leaderboard[contestId] || [];
  return lb.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
    user: getUserById(entry.userId),
  })).sort((a, b) => b.score - a.score || a.penalty - b.penalty);
}

export function getContestQuestions(contestId) {
  const contest = getContestById(contestId);
  if (!contest) return [];
  return contest.questionIds.map(qId => getQuestionById(qId)).filter(Boolean);
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getStatusBadgeClass(status) {
  const map = {
    draft: 'badge-draft',
    scheduled: 'badge-scheduled',
    running: 'badge-running',
    paused: 'badge-paused',
    ended: 'badge-ended',
    online: 'badge-online',
    busy: 'badge-busy',
    offline: 'badge-offline',
    accepted: 'badge-accepted',
    wrong_answer: 'badge-wrong',
    time_limit: 'badge-tle',
    runtime_error: 'badge-wrong',
    pending: 'badge-pending',
    easy: 'badge-easy',
    medium: 'badge-medium',
    hard: 'badge-hard',
  };
  return map[status] || 'badge-draft';
}

export function getStatusLabel(status) {
  const map = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    running: 'Running',
    paused: 'Paused',
    ended: 'Ended',
    online: 'Online',
    busy: 'Busy',
    offline: 'Offline',
    accepted: 'Accepted',
    wrong_answer: 'Wrong Answer',
    time_limit: 'TLE',
    runtime_error: 'Runtime Error',
    pending: 'Pending',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
  };
  return map[status] || status;
}

// Simulated code execution
export function simulateExecution(code, language, testCases) {
  return new Promise((resolve) => {
    const delay = 800 + Math.random() * 1500;
    setTimeout(() => {
      const passed = Math.floor(Math.random() * (testCases.length + 1));
      const allPassed = passed === testCases.length;
      resolve({
        status: allPassed ? 'accepted' : (Math.random() > 0.5 ? 'wrong_answer' : 'time_limit'),
        runtime: Math.floor(Math.random() * 200) + 10,
        memory: (Math.random() * 20 + 8).toFixed(1),
        testsPassed: passed,
        totalTests: testCases.length,
        output: allPassed ? 'All test cases passed!' : `Failed on test case ${passed + 1}`,
        stdout: testCases[0]?.expected || '',
      });
    }, delay);
  });
}

// Simulated practice execution
export function simulatePracticeRun(code, language, input) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!code.trim()) {
        resolve({ output: '', error: 'Error: Empty code', runtime: 0 });
        return;
      }
      // Simple simulation
      let output = '';
      if (language === 'python') {
        if (code.includes('print')) output = 'Hello, World!\n';
        else if (code.includes('def ')) output = 'Function defined successfully.\n';
        else output = `Executed ${code.split('\n').length} lines of Python code.\n`;
      } else if (language === 'cpp' || language === 'c') {
        if (code.includes('cout') || code.includes('printf')) output = 'Hello, World!\n';
        else output = `Compiled and executed ${code.split('\n').length} lines of C++ code.\n`;
      } else if (language === 'java') {
        output = `Compiled and executed Java program.\n`;
      } else if (language === 'javascript') {
        try {
          output = `JavaScript output: executed successfully.\n`;
        } catch {
          output = 'Error in JavaScript execution.\n';
        }
      }
      resolve({
        output: output || 'Program executed with no output.',
        error: '',
        runtime: Math.floor(Math.random() * 100) + 5,
      });
    }, 600 + Math.random() * 800);
  });
}
