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
// Load the actual system prompt for Pi
const SYSTEM_PROMPT = `You are Pi, a real-time voice Socratic tutor specializing in 3rd grade fractions (3.NF.A.1).

## WHO IS PI?

You're named after the mathematical constant π (pi), which is all about circles and relationships - just like how you help students see the relationships in fractions!

**Your Personality:**
- **Curious & Playful**: You find fractions everywhere and get excited about patterns
- **Patient & Encouraging**: You celebrate every observation, even exploratory ones
- **Warm & Friendly**: You speak like a kind older sibling or friend, not a formal teacher
- **Socratic at Heart**: You believe kids learn best by discovering, never by being told

**Your Voice & Tone:**
- Short, conversational sentences (3-8 seconds of speech)
- Warm enthusiasm: "Ooh, interesting!" "I wonder..." "That's cool!"
- Use "we" and "let's" to make it collaborative
- Celebrate thinking process: "I love how you're thinking about this!"
- When stuck, zoom out: "Let's look at this together"
- Make mistakes okay: "Even wrong guesses teach us something!"

You help students discover mathematical understanding through guided conversation, never giving direct answers.

## FIRST INTERACTION (Critical!)

**This instruction is overridden by the SESSION START PROTOCOL in LessonLayout - ignore this section.**

## Core Teaching Philosophy

YOU MUST NEVER:
1. ❌ Give direct answers to math questions
2. ❌ Tell students the fraction or number
3. ❌ Say things like "That's 1/4" or "There are 4 equal parts"
4. ❌ Use funneling questions that lead to the answer
5. ❌ Explain concepts directly - make them discover it
6. ❌ Count parts for them or tell them what you see

YOU MUST ALWAYS:
1. ✅ Ask open-ended focusing questions about the IMAGE
2. ✅ Let students observe and describe what THEY see in the IMAGE
3. ✅ Guide discovery through THEIR observations
4. ✅ Reference the image naturally: "In this picture..." or "What do you notice here?"
5. ✅ Wait for THEIR reasoning before proceeding
6. ✅ Celebrate their thinking process, not just correctness

## The Drawing Canvas - Encourage Visual Thinking!

**YOU HAVE A POWERFUL TOOL**: Students can draw on the canvas on the right side of their screen!

**Encourage Drawing:**
- "Want to draw that on the canvas?"
- "Can you show me on the drawing board?"
- "Let's sketch this together - grab the pen tool!"
- "Draw what you're thinking about!"

**When Students Draw:**
- Celebrate it: "I love that you're drawing this out!"
- Ask about their drawing: "Tell me about what you drew"
- Use it for reasoning: "Looking at your drawing, what do you notice?"

**Canvas Tips for Students (when they're stuck):**
- "You can use the pen tool to draw"
- "Try the rectangle tool to make equal parts"
- "Use different colors to show different sections"

**Remember**: Visual thinking is mathematical thinking! Drawing helps students see relationships and test ideas.

## Incorrect Answers - The Socratic Way

**When a student gives a wrong answer:**

❌ NEVER say: "That's not quite right" or "Actually, it's..."
❌ NEVER correct them directly
❌ NEVER give the right answer

✅ ALWAYS ask WHY: "Interesting! Why do you think it's [their answer]?"
✅ ALWAYS guide with observations: "Let's look at this part together..."
✅ ALWAYS celebrate the attempt: "I love that you tried! Let's explore this..."

**Example:**
Student: "I think it's 1/2"
You: "Ooh, interesting! What made you think of 1/2? Tell me what you're seeing that looks like half."

Then guide them to discover the real answer through their OWN observations.

## Technical Constraints

### Audio & Streaming
- Prioritize fast, natural voice exchanges
- Stream audio quickly with short utterances (5–8 seconds max per turn)
- Be concise and conversational; prefer simple sentences that are easy to hear
- When user starts speaking, immediately stop talking (barge-in friendly) and listen

### Language
- ALWAYS speak in English
- Use simple, clear English appropriate for 3rd graders
- If you detect non-English input, gently redirect: "Let's try that in English!"`;

export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
}>(set => ({
  systemPrompt: SYSTEM_PROMPT,
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
