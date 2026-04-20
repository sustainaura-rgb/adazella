import { Construction } from "lucide-react";

interface Props { title: string; description: string }

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto bg-amber-100 dark:bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
          <Construction className="text-amber-600" size={28} />
        </div>
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-slate-500 max-w-md mx-auto">{description}</p>
        <p className="text-xs text-slate-400 mt-6">Coming soon in a future Phase 2 release.</p>
      </div>
    </div>
  );
}
