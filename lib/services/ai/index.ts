import { env } from '@/lib/env';
import { AiExtractionService } from './aiService';
import { RuleBasedAiExtractionService } from './ruleBasedAi';
import { RemoteAiExtractionService } from './remoteAi';

/**
 * Builds the active AI extraction service from AI_MODE.
 *  dev    -> RuleBasedAiExtractionService (offline, deterministic, always works)
 *  remote -> RemoteAiExtractionService (needs OPENAI_API_KEY)
 */
export function createAiExtractionService(mode: string = env.AI_MODE): AiExtractionService {
  if (mode === 'remote') return new RemoteAiExtractionService();
  return new RuleBasedAiExtractionService();
}

let instance: AiExtractionService | null = null;
export function getAiExtractionService(): AiExtractionService {
  if (!instance) instance = createAiExtractionService();
  return instance;
}

export function resetAiExtractionService(): void {
  instance = null;
}