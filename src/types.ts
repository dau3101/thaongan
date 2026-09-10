export type QuestionType = 
  | 'multiple_choice' 
  | 'fill_blank' 
  | 'word_form' 
  | 'sentence_rewrite' 
  | 'short_answer';

export interface Question {
  id: string;
  type?: QuestionType; // Format: multiple_choice, fill_blank, word_form, sentence_rewrite, short_answer
  text: string;
  options: string[]; // For multiple choice (A, B, C, D) or word bank
  correctAnswer: number; // Index of the correct option (for multiple choice)
  correctTextAnswers?: string[]; // Array of acceptable text answers for fill_blank, word_form, sentence_rewrite
  promptWord?: string; // Root word in brackets for word_form, e.g. "HAPPY" or "SUCCEED"
  givenPrefix?: string; // Suggested starting phrase for sentence_rewrite, e.g. "She spends..."
  explanation: string;
  topic: string;
  context?: string; // Optional context like reading passages or instructions
  points?: number; // Score/bareme for this question (defaults to balanced weight)
  penaltyPoints?: number; // Penalty/deduction points for wrong answers (defaults to 0)
}

export interface TestData {
  id: string;
  testCode: string; // Sequential or unique code for students
  title: string;
  category?: string; // Cabinet for organization
  questions: Question[];
  date: string;
  authorUid?: string;
  isPublic?: boolean;
  audioData?: string[]; // Array of base-64 string urls for audio files
  excludeAudio?: boolean; // When teacher chose paper exam mode without audio
}

export interface UserAnswer {
  questionId: string;
  selectedOption?: number; // For multiple choice
  textAnswer?: string; // For fill_blank, word_form, sentence_rewrite, short_answer
  isCorrect: boolean;
}

export interface PracticeSet {
  topic: string;
  questions: {
    text: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
}
