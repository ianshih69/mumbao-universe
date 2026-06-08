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
    <div className="inline-grid h-11 grid-cols-[2.75rem_3.25rem_2.75rem] overflow-hidden rounded-full border border-[#eadfce] bg-white shadow-sm shadow-stone-100">
      <Button
        type="button"
        variant="ghost"
        className="h-11 rounded-none p-0 text-stone-600 hover:bg-[#f3eadf] hover:text-[#765d4a] disabled:opacity-35"
        disabled={!canDecrease}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="減少數量"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="flex items-center justify-center border-x border-[#f0e5d7] text-sm font-semibold text-stone-800">
        {value}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-11 rounded-none p-0 text-stone-600 hover:bg-[#f3eadf] hover:text-[#765d4a] disabled:opacity-35"
        disabled={!canIncrease}
        onClick={() => onChange(typeof max === "number" ? Math.min(max, value + 1) : value + 1)}
        aria-label="增加數量"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
