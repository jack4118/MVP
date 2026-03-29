import { useLanguage } from '../contexts/LanguageContext';
import { AiGenerationDebug } from '../services/api';
import { GenerationStage } from '../features/ai/shared';

interface AiStatusPanelProps {
  generationStage: GenerationStage;
  generationDebug: AiGenerationDebug | null;
}

const AiStatusPanel = ({ generationStage, generationDebug }: AiStatusPanelProps) => {
  const { t } = useLanguage();

  return (
    <div className={`ai-state-panel ai-state-${generationStage}`}>
      <div className="ai-state-visual" aria-hidden="true">
        {generationStage === 'ready' && <div className="ai-state-orbit"></div>}
        {generationStage === 'thinking' && (
          <div className="ai-state-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
        {generationStage === 'done' && <div className="ai-state-check">OK</div>}
      </div>
      <div className="ai-state-text">
        <div className="ai-state-title">
          {generationStage === 'ready' && t.ai.statusReadyTitle}
          {generationStage === 'thinking' && t.ai.statusThinkingTitle}
          {generationStage === 'done' && t.ai.statusDoneTitle}
        </div>
        <div className="ai-state-desc">
          {generationStage === 'ready' && t.ai.statusReadyDesc}
          {generationStage === 'thinking' && t.ai.statusThinkingDesc}
          {generationStage === 'done' && t.ai.statusDoneDesc}
        </div>
        {generationDebug && (
          <div className="ai-debug-grid">
            <div className="ai-debug-item">
              <span>{t.ai.debugLanguage}</span>
              <strong>{generationDebug.requested.language}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugGoal}</span>
              <strong>{generationDebug.requested.goal || '-'}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugChannel}</span>
              <strong>{generationDebug.requested.channel}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugStyle}</span>
              <strong>{generationDebug.requested.style}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugContext}</span>
              <strong>{generationDebug.requested.context || '-'}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugDays}</span>
              <strong>{generationDebug.requested.daysPassed}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugEmoji}</span>
              <strong>
                {generationDebug.checks.emojiCount} ({generationDebug.checks.emojiMin}-{generationDebug.checks.emojiMax})
              </strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugEmojiMatch}</span>
              <strong>{generationDebug.checks.emojiInRange ? t.ai.debugYes : t.ai.debugNo}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugModeMatch}</span>
              <strong>{generationDebug.checks.styleSignalDetected ? t.ai.debugYes : t.ai.debugNo}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugObjective}</span>
              <strong>{generationDebug.checks.goalCoverageRatio}</strong>
            </div>
            <div className="ai-debug-item">
              <span>{t.ai.debugObjectiveMatch}</span>
              <strong>{generationDebug.checks.goalCoveragePass ? t.ai.debugYes : t.ai.debugNo}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiStatusPanel;
