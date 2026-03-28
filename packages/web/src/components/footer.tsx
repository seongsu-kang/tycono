import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-16 px-6 border-t border-base-700/10">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-base-800 border border-base-600/30 flex items-center justify-center">
                <span className="text-accent font-bold text-sm">T</span>
              </div>
              <span className="font-display font-semibold text-base-50">Tycono</span>
            </div>
            <p className="text-sm text-base-500 leading-relaxed">Your company, in code.</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-base-300 uppercase tracking-wider mb-4">Product</h4>
            <div className="space-y-2.5 text-sm">
              <Link href="/" className="block text-base-400 hover:text-base-50 transition-colors">Home</Link>
              <Link href="/agencies" className="block text-base-400 hover:text-base-50 transition-colors">Agencies</Link>
              <a href="#plugin" className="block text-base-400 hover:text-base-50 transition-colors">Plugin</a>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-base-300 uppercase tracking-wider mb-4">Resources</h4>
            <div className="space-y-2.5 text-sm">
              <a href="https://github.com/seongsu-kang/tycono" target="_blank" rel="noopener noreferrer" className="block text-base-400 hover:text-base-50 transition-colors">GitHub</a>
              <a href="https://www.npmjs.com/package/tycono" target="_blank" rel="noopener noreferrer" className="block text-base-400 hover:text-base-50 transition-colors">npm</a>
              <a href="https://github.com/seongsu-kang/tycono#readme" target="_blank" rel="noopener noreferrer" className="block text-base-400 hover:text-base-50 transition-colors">Docs</a>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-base-300 uppercase tracking-wider mb-4">Community</h4>
            <div className="space-y-2.5 text-sm">
              <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="block text-base-400 hover:text-base-50 transition-colors">Twitter/X</a>
            </div>
          </div>
        </div>
        <div className="border-t border-base-700/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-base-500">MIT License &copy; 2026</p>
          <p className="text-xs text-base-500">Built by Tycono, with Tycono.</p>
        </div>
      </div>
    </footer>
  );
}
