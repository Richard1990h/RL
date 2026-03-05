"use client";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export default function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="overflow-x-auto border-b border-border">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors
                ${
                  isActive
                    ? "text-text"
                    : "text-text-muted hover:text-text-secondary"
                }
              `}
            >
              {tab.label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{
                    animation: "tabSlide 200ms ease-out",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes tabSlide {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
