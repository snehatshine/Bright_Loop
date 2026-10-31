export default function Stepper({ steps, currentStep }) {
  const currentIndex = steps.findIndex(s => s.toLowerCase() === (currentStep || '').toLowerCase());

  return (
    <div className="stepper" aria-label="Progress">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isActive = idx === currentIndex;
        const stateClass = isCompleted ? 'completed' : (isActive ? 'active' : '');

        return (
          <div key={step} className={`step-item ${stateClass}`}>
            <div className="step-circle" aria-current={isActive ? 'step' : undefined}>
              {isCompleted ? '✓' : idx + 1}
            </div>
            <span className="step-name">{step}</span>
            {idx < steps.length - 1 && <div className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}
