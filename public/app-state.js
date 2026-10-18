const generateId = () => Math.random().toString(36).substr(2, 9);
const colors = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600'];

const defaultData = { subjects: [], xp: 0 };
let data = JSON.parse(JSON.stringify(defaultData));

let isEditMode = true; 
let currentView = 'dashboard';
let viewHistory = [];
let activeSubtopicId = null; 
let activeSetId = null; 
let activeAnalyticsSubjectId = null; 
let editingFlashcardId = null;
let editingQuestionId = null;
// Expansion state is kept in memory; it does not change saved study data.
// Sections are marked as initialized on first render so each one defaults to
// collapsed, but a user's expand/collapse choice is preserved during navigation.
const collapsedSubjectIds = new Set();
const collapsedTopicIds = new Set();
const expandedSubtopicIds = new Set();
const initializedDashboardSubjectIds = new Set();
const initializedDashboardTopicIds = new Set();
// Analytics expansion state is separate from the Learning Path dashboard state.
const collapsedAnalyticsSubjectIds = new Set();
const collapsedAnalyticsTopicIds = new Set();
const collapsedAnalyticsSubtopicIds = new Set();
const initializedAnalyticsSubjectIds = new Set();
const initializedAnalyticsTopicIds = new Set();
const initializedAnalyticsSubtopicIds = new Set();
let studyContext = { type: null, step: 0, score: 0, answers: {}, isFlipped: false, isChecked: false, timeSpent: [], timeRecorded: {}, qStart: 0 };

window.app = {
    tempImageUrl: '',
    imageUploadInProgress: false
};
