import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const canDecrease = value > min;
  const canIncrease = typeof max === "number" ? value < max : true;

  return (
    <div className="inline-grid h-10 grid-cols-[2.5rem_3rem_2.5rem] overflow-hidden rounded-full border border-stone-200 bg-white">
      <Button
        type="button"
        variant="ghost"
        className="h-10 rounded-none p-0"
        disabled={!canDecrease}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="減少數量"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="flex items-center justify-center border-x border-stone-100 text-sm font-medium">
        {value}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-10 rounded-none p-0"
        disabled={!canIncrease}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        aria-label="增加數量"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
