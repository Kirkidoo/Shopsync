import { render, screen } from '@testing-library/react';
import { Stepper, Step } from './stepper';

// Mock lucide-react to avoid ESM issues
jest.mock('lucide-react', () => ({
    Check: () => <div data-testid="icon-check" />,
    CircleDot: () => <div data-testid="icon-circle-dot" />,
    Circle: () => <div data-testid="icon-circle" />,
}));

describe('Stepper', () => {
    const steps: Step[] = [
        { id: '1', label: 'Step 1' },
        { id: '2', label: 'Step 2' },
        { id: '3', label: 'Step 3' },
    ];

    it('renders all steps', () => {
        render(<Stepper steps={steps} currentStepId="1" />);
        expect(screen.getByText('Step 1')).toBeInTheDocument();
        expect(screen.getByText('Step 2')).toBeInTheDocument();
        expect(screen.getByText('Step 3')).toBeInTheDocument();
    });

    it('highlights the current step', () => {
        render(<Stepper steps={steps} currentStepId="2" />);
        expect(screen.getByText('Step 2')).toHaveClass('text-primary');
    });

    it('renders correctly with React.memo', () => {
        const { rerender } = render(<Stepper steps={steps} currentStepId="1" />);
        expect(screen.getByText('Step 1')).toBeInTheDocument();

        // Rerender with same props
        rerender(<Stepper steps={steps} currentStepId="1" />);
        expect(screen.getByText('Step 1')).toBeInTheDocument();
    });
});
