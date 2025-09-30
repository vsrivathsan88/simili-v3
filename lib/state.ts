/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { customerSupportTools } from './tools/customer-support';
import { personalAssistantTools } from './tools/personal-assistant';
import { navigationSystemTools } from './tools/navigation-system';
import { lessonTutorTools } from './tools/lesson-tutor';

export type Template = 'customer-support' | 'personal-assistant' | 'navigation-system' | 'lesson-tutor';

const toolsets: Record<Template, FunctionCall[]> = {
  'customer-support': customerSupportTools,
  'personal-assistant': personalAssistantTools,
  'navigation-system': navigationSystemTools,
  'lesson-tutor': lessonTutorTools,
};

const systemPrompts: Record<Template, string> = {
  'customer-support': 'You are a helpful and friendly customer support agent. Be conversational and concise.',
  'personal-assistant': 'You are a helpful and friendly personal assistant. Be proactive and efficient.',
  'navigation-system': 'You are a helpful and friendly navigation assistant. Provide clear and accurate directions.',
  'lesson-tutor': 'You are Pi, a Socratic tutor for 3rd grade fractions. Use focusing questions to guide discovery.',
};
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
} from '@google/genai';

/**
 * Settings
 */
export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
}>(set => ({
  systemPrompt: `You are a helpful and friendly AI assistant. Be conversational and concise.`,
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
}));

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}>(set => ({
  isSidebarOpen: true,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}



export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
  toggleTool: (toolName: string) => void;
  addTool: () => void;
  removeTool: (toolName: string) => void;
  updateTool: (oldName: string, updatedTool: FunctionCall) => void;
}>(set => ({
  tools: customerSupportTools,
  template: 'customer-support',
  setTemplate: (template: Template) => {
    set({ tools: toolsets[template], template });
    useSettings.getState().setSystemPrompt(systemPrompts[template]);
  },
  toggleTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.map(tool =>
        tool.name === toolName ? { ...tool, isEnabled: !tool.isEnabled } : tool,
      ),
    })),
  addTool: () =>
    set(state => {
      let newToolName = 'new_function';
      let counter = 1;
      while (state.tools.some(tool => tool.name === newToolName)) {
        newToolName = `new_function_${counter++}`;
      }
      return {
        tools: [
          ...state.tools,
          {
            name: newToolName,
            isEnabled: true,
            description: '',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        ],
      };
    }),
  removeTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.filter(tool => tool.name !== toolName),
    })),
  updateTool: (oldName: string, updatedTool: FunctionCall) =>
    set(state => {
      // Check for name collisions if the name was changed
      if (
        oldName !== updatedTool.name &&
        state.tools.some(tool => tool.name === updatedTool.name)
      ) {
        console.warn(`Tool with name "${updatedTool.name}" already exists.`);
        // Prevent the update by returning the current state
        return state;
      }
      return {
        tools: state.tools.map(tool =>
          tool.name === oldName ? updatedTool : tool,
        ),
      };
    }),
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
}

export const useLogStore = create<{
  turns: ConversationTurn[];
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  clearTurns: () => void;
}>((set, get) => ({
  turns: [],
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) =>
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp: new Date() }],
    })),
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [] }),
}));

/**
 * Scene Management for Lesson
 */
export interface Scene {
  id: string;
  title: string;
  description: string;
  image: string;
  representation?: string;
  fraction?: string;
  equal_partitions?: boolean;
  milestone_fit?: string[];
  targets_misconceptions?: string[];
  prompts: string[];
  reasoning_notes?: string;
}

export const useSceneStore = create<{
  currentSceneId: string | null;
  availableScenes: Scene[];
  setCurrentScene: (sceneId: string) => void;
  loadScenes: (scenes: Scene[]) => void;
  getCurrentScene: () => Scene | null;
}>((set, get) => ({
  currentSceneId: null,
  availableScenes: [],
  setCurrentScene: (sceneId: string) => {
    const scene = get().availableScenes.find(s => s.id === sceneId);
    if (scene) {
      set({ currentSceneId: sceneId });
      // Log the scene change
      useLogStore.getState().addTurn({
        role: 'system',
        text: `Scene changed to: **${scene.title}**\n${scene.description}`,
        isFinal: true,
      });
    }
  },
  loadScenes: (scenes: Scene[]) => {
    set({ availableScenes: scenes });
    // Set first scene as default if none selected
    if (!get().currentSceneId && scenes.length > 0) {
      set({ currentSceneId: scenes[0].id });
    }
  },
  getCurrentScene: () => {
    const { currentSceneId, availableScenes } = get();
    return availableScenes.find(s => s.id === currentSceneId) || null;
  },
}));

/**
 * Milestone Progress Tracking for 3.NF.A.1
 */
export type MilestoneId = 'M0' | 'M1' | 'M2' | 'M3' | 'M4';

export interface MilestoneProgress {
  id: MilestoneId;
  name: string;
  achieved: boolean;
  achievedAt?: Date;
}

export const useMilestoneStore = create<{
  milestones: MilestoneProgress[];
  achieveMilestone: (id: MilestoneId) => void;
  resetProgress: () => void;
  getAchievedCount: () => number;
}>((set, get) => ({
  milestones: [
    { id: 'M0', name: 'Anchor the Whole', achieved: false },
    { id: 'M1', name: 'Equal Parts', achieved: false },
    { id: 'M2', name: 'Unit Fraction 1/b', achieved: false },
    { id: 'M3', name: 'Compose a/b', achieved: false },
    { id: 'M4', name: 'Edge Cases', achieved: false },
  ],
  achieveMilestone: (id: MilestoneId) => {
    set(state => ({
      milestones: state.milestones.map(m =>
        m.id === id && !m.achieved
          ? { ...m, achieved: true, achievedAt: new Date() }
          : m
      ),
    }));
    
    // Log the achievement
    const milestone = get().milestones.find(m => m.id === id);
    if (milestone) {
      useLogStore.getState().addTurn({
        role: 'system',
        text: `🎉 Milestone Achieved: **${milestone.name}** (${id})`,
        isFinal: true,
      });
    }
  },
  resetProgress: () => {
    set({
      milestones: [
        { id: 'M0', name: 'Anchor the Whole', achieved: false },
        { id: 'M1', name: 'Equal Parts', achieved: false },
        { id: 'M2', name: 'Unit Fraction 1/b', achieved: false },
        { id: 'M3', name: 'Compose a/b', achieved: false },
        { id: 'M4', name: 'Edge Cases', achieved: false },
      ],
    });
  },
  getAchievedCount: () => {
    return get().milestones.filter(m => m.achieved).length;
  },
}));
