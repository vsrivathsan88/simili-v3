/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { FunctionResponseScheduling } from '@google/genai';
import { FunctionCall } from '../state';

export const lessonTutorTools: FunctionCall[] = [
  {
    name: 'switch_scene',
    description: 'Switch to a different visual scene/image to help the student explore fraction concepts. Use this when the student has sufficiently explored the current scene, when they need a different representation, when addressing a misconception, or when progressing to a new concept.',
    parameters: {
      type: 'OBJECT',
      properties: {
        scene_id: {
          type: 'STRING',
          description: 'The ID of the scene to switch to. Available scenes: "sheet-pan-fourths" (1/4, clean example for equal parts), "two-bottles-half" (1/2, different wholes), "two-posters-fourths" (1/4, different wholes), "garden-bed-unequal" (non-example with unequal parts), "lunch-tray-two-fourths" (2/4, numerator > 1), "battery-icon" (3/7, edge cases), "lunch-trays" (multiple wholes), "water-bottle-ruler" (1/5, measurement), "bike-path-posts" (1/4, number line), "tile-mosaic" (unequal tiles, non-example)',
        },
        reason: {
          type: 'STRING',
          description: 'Brief pedagogical reason for switching (e.g., "student ready for different representation", "addressing unequal parts misconception", "introducing numerator > 1")',
        },
      },
      required: ['scene_id'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
];
