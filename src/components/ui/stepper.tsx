import { Check, CircleDot, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { memo } from 'react';

export interface Step {
    id: string;
    label: string;
    description?: string;
}

interface StepperProps {
    steps: Step[];
    currentStepId: string;
    onStepClick?: (stepId: string) => void;
    className?: string;
}

// Optimized: Wrapped in React.memo to prevent unnecessary re-renders when parent state updates
// (e.g., timer ticks in AuditStepper) but props remain referentially stable.
export const Stepper = memo(({ steps, currentStepId, onStepClick, className }: StepperProps) => {
    const currentStepIndex = steps.findIndex((s) => s.id === currentStepId);

    return (
        <div className={cn("w-full py-4", className)}>
            <div className="relative flex items-center justify-between">
                {/* Connecting Lines */}
                <div className="absolute left-0 top-5 -z-10 h-[2px] w-full bg-muted">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-in-out"
                        style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                    />
                </div>

                {steps.map((step, index) => {
                    const isCompleted = index < currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    const isClickable = onStepClick && index < currentStepIndex;

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "group flex flex-col items-center gap-2 bg-background px-2",
                                isClickable && "cursor-pointer"
                            )}
                            onClick={() => isClickable && onStepClick(step.id)}
                        >
                            <div
                                className={cn(
                                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300",
                                    isCompleted
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : isCurrent
                                            ? "border-primary bg-background text-primary shadow-lg scale-110"
                                            : "border-muted-foreground/30 bg-muted text-muted-foreground"
                                )}
                            >
                                {isCompleted ? (
                                    <Check className="h-6 w-6" />
                                ) : isCurrent ? (
                                    <CircleDot className="h-6 w-6" />
                                ) : (
                                    <Circle className="h-6 w-6" />
                                )}
                            </div>
                            <div className="flex flex-col items-center text-center">
                                <span
                                    className={cn(
                                        "text-xs font-semibold uppercase tracking-wider transition-colors duration-300",
                                        isCurrent ? "text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    {step.label}
                                </span>
                                {/* Optional Description - Hidden on small screens if needed */}
                                {/* <span className="hidden text-[10px] text-muted-foreground sm:block">
                      {step.description}
                  </span> */}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
Stepper.displayName = 'Stepper';
