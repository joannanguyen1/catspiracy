import React, { useState, useCallback, useEffect } from 'react';

const LENGTH = 6;
const BUTTONS = ['A', 'B', 'C', 'D'];

function randomSequence(): number[] {
  return Array.from({ length: LENGTH }, () => Math.floor(Math.random() * BUTTONS.length));
}

type Props = { onWin: () => void; onCancel: () => void };

export default function SimpleSequence({ onWin, onCancel }: Props) {
  const [sequence] = useState<number[]>(() => randomSequence());
  const [step, setStep] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [phase, setPhase] = useState<'show' | 'play'>('show');
  const [highlight, setHighlight] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== 'show') return;
    let i = 0;
    const run = () => {
      if (i >= sequence.length) {
        setPhase('play');
        setHighlight(null);
        return;
      }
      setHighlight(sequence[i]);
      setTimeout(() => {
        setHighlight(null);
        i++;
        if (i < sequence.length) setTimeout(run, 300);
        else setPhase('play');
      }, 500);
    };
    const t = setTimeout(run, 400);
    return () => clearTimeout(t);
  }, [phase, sequence]);

  const press = useCallback(
    (index: number) => {
      if (wrong || phase !== 'play') return;
      if (index === sequence[step]) {
        if (step + 1 >= LENGTH) {
          onWin();
          return;
        }
        setStep((s) => s + 1);
      } else {
        setWrong(true);
        setTimeout(() => {
          setStep(0);
          setWrong(false);
        }, 800);
      }
    },
    [sequence, step, wrong, phase, onWin]
  );

  return (
    <div className="minigame-sequence">
      <p className="minigame-goal">
        {phase === 'show' ? 'Watch the sequence…' : `Repeat it! (${step}/${LENGTH})`}
      </p>
      {wrong && <p className="minigame-sequence-wrong">Wrong! Try again.</p>}
      <div className="minigame-sequence-buttons">
        {BUTTONS.map((label, index) => (
          <button
            key={index}
            type="button"
            className="minigame-sequence-btn"
            data-highlight={highlight === index}
            onClick={() => press(index)}
            disabled={wrong || phase === 'show'}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="minigame-cancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}
