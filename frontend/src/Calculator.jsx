import React, { useState } from 'react';
import './Calculator.css';

const Calculator = ({ onUnlock }) => {
  const [display, setDisplay] = useState('1091');
  const [formula, setFormula] = useState('');
  const [slashCount, setSlashCount] = useState(0);

  const handleKey = (key) => {
    if (key === '/') {
      const newCount = slashCount + 1;
      if (newCount >= 5) {
        onUnlock();
        return;
      }
      setSlashCount(newCount);
    } else {
      setSlashCount(0);
    }

    if (key === 'C') {
      setDisplay('0');
      setFormula('');
      return;
    }

    if (key === '=') {
      try {
        const result = eval(formula + display);
        setDisplay(String(result));
        setFormula('');
      } catch (e) {
        setDisplay('Error');
      }
      return;
    }

    if (['+', '-', '*', '/'].includes(key)) {
      setFormula(display + key);
      setDisplay('0');
      return;
    }

    if (display === '0') {
      setDisplay(key);
    } else {
      setDisplay(display + key);
    }
  };

  const buttons = [
    ['C', '+/-', '%', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '=']
  ];

  return (
    <div className="calculator-guard">
      <div className="calc-display">
        <div className="formula">{formula}</div>
        <div className="result">{display}</div>
      </div>
      <div className="calc-buttons">
        {buttons.flat().map((btn) => (
          <button
            key={btn}
            className={`calc-btn ${['/', '*', '-', '+', '='].includes(btn) ? 'orange' : ['C', '+/-', '%'].includes(btn) ? 'light-grey' : 'dark-grey'} ${btn === '0' ? 'zero' : ''}`}
            onClick={() => handleKey(btn)}
          >
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Calculator;
