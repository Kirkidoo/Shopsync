import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuditTimer } from './audit-timer';

describe('AuditTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders correctly with initial time', () => {
    const startTime = Date.now();
    render(<AuditTimer startTime={startTime} />);

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('Time Elapsed')).toBeInTheDocument();
  });

  it('updates time every second', () => {
    const startTime = Date.now();
    render(<AuditTimer startTime={startTime} />);

    expect(screen.getByText('0:00')).toBeInTheDocument();

    // Advance time by 1 second
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('0:01')).toBeInTheDocument();

    // Advance time by 59 seconds (total 1 minute)
    act(() => {
      jest.advanceTimersByTime(59000);
    });

    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('calculates time correctly from start time', () => {
    const startTime = Date.now() - 65000; // Started 1 minute and 5 seconds ago
    render(<AuditTimer startTime={startTime} />);

    expect(screen.getByText('1:05')).toBeInTheDocument();
  });
});
