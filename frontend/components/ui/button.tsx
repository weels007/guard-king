import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-sm text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brass disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        seal: "bg-seal text-parchment hover:bg-sealdeep",
        primary: "bg-primary-text text-black hover:bg-white",
        brass: "bg-brass text-ink hover:bg-parchment",
        pine: "bg-pine text-ink hover:brightness-110",
        ghost: "border border-parchment/25 text-parchment hover:bg-ink2",
        danger: "border border-seal/60 text-seal hover:bg-seal hover:text-parchment",
      },
      size: {
        md: "px-5 py-2.5",
        sm: "px-3 py-1.5 text-[13px]",
        block: "w-full px-4 py-3",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
