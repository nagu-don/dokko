import React, { useCallback, useEffect, useRef } from 'react';
import './HoldButton.css';

const CLICK_WINDOW = 260;        // ms — a 2nd click inside this counts as a double click
const HOLD_DELAY   = 350;        // ms — how long before a press becomes a "hold"
const START_MS     = 600;        // first repeat interval (slowest)
const MIN_MS       = 1000 / 3;   // ~333ms → hard cap of 3 changes per second
const DECAY        = 0.82;       // each tick is 18% faster than the last

/**
 * A stepper button with three interactions:
 *   single click        -> onStep(step)        e.g. 0.1 kg
 *   double click        -> total of bulkStep   e.g. 1.0 kg
 *   press and hold      -> onStep(bulkStep) repeatedly, accelerating to 3/sec
 */
const HoldButton = ({
  onStep,
  step = 0.1,
  bulkStep = 1,
  disabled = false,
  className = '',
  children,
  ...rest
}) => {
  const holdTimer   = useRef(null);   // pointerdown -> hold detection
  const repeatTimer = useRef(null);   // the accelerating repeat loop
  const clickTimer  = useRef(null);   // double-click detection window
  const clickCount  = useRef(0);
  const didHold     = useRef(false);
  const delay       = useRef(START_MS);

  // refs so the repeat loop always sees fresh values without restarting
  const disabledRef = useRef(disabled);
  const onStepRef   = useRef(onStep);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { onStepRef.current = onStep; }, [onStep]);

  const stopRepeat = useCallback(() => {
    clearTimeout(holdTimer.current);
    clearTimeout(repeatTimer.current);
    holdTimer.current = null;
    repeatTimer.current = null;
  }, []);

  // clean up if the component unmounts mid-press
  useEffect(() => () => {
    stopRepeat();
    clearTimeout(clickTimer.current);
  }, [stopRepeat]);

  // recursive setTimeout (not setInterval) so the delay can shrink each tick
  const tick = useCallback(() => {
    if (disabledRef.current) { stopRepeat(); return; }   // e.g. quantity hit 0
    onStepRef.current(bulkStep);
    delay.current = Math.max(MIN_MS, delay.current * DECAY);
    repeatTimer.current = setTimeout(tick, delay.current);
  }, [bulkStep, stopRepeat]);

  const handlePointerDown = (e) => {
    if (disabled || e.button > 0) return;          // ignore right/middle click
    // capture so we still get pointerup if the finger slides off the button
    e.currentTarget.setPointerCapture?.(e.pointerId);

    didHold.current = false;
    delay.current = START_MS;

    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      clearTimeout(clickTimer.current);            // a hold cancels click counting
      clickCount.current = 0;
      tick();                                      // first bulk change fires immediately
    }, HOLD_DELAY);
  };

  const handleClick = () => {
    if (disabled) return;

    // the click fired at the end of a hold — the hold already applied the change
    if (didHold.current) { didHold.current = false; return; }

    clickCount.current += 1;

    if (clickCount.current === 1) {
      onStepRef.current(step);                     // 0.1
    } else if (clickCount.current === 2) {
      onStepRef.current(bulkStep - step);          // tops the pair up to exactly 1.0
    } else {
      onStepRef.current(bulkStep);                 // 3rd+ rapid click = 1.0 each
    }

    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { clickCount.current = 0; }, CLICK_WINDOW);
  };

  return (
    <button
      type='button'
      className={`hold-button ${className}`}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={stopRepeat}
      onPointerCancel={stopRepeat}
      onClick={handleClick}
      onDoubleClick={(e) => e.preventDefault()}     // stop text selection
      onContextMenu={(e) => e.preventDefault()}     // stop long-press menu on mobile
      {...rest}
    >
      {children}
    </button>
  );
};

export default HoldButton;