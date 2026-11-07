// Shared data types, free of Phaser and React so tools, tests and the game can all use them.

export const TOPICS = [
  'Spending and Saving',
  'Credit and Debt',
  'Employment and Income',
  'Investing',
  'Risk and Insurance',
  'Financial Decision Making',
] as const;
export type Topic = (typeof TOPICS)[number];

export const BANDS = ['K-5', '6-8'] as const;
export type Band = (typeof BANDS)[number];

/** One question in src/data/questions.json. `correct` indexes the unshuffled `options`. */
export interface Question {
  id: string;
  topic: Topic;
  band: Band;
  question: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface QuestionFile {
  note: string;
  source: string;
  overridesApplied: string[];
  questions: Question[];
}
