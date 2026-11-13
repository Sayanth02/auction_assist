import { createClient } from '@/lib/supabase/server';
import type { Settings } from '@/lib/supabase/types';
import SettingsForm from './SettingsForm';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('*').single();
  const settings = data as Settings | null;

  return (
    <div className="w-full">
      <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="vsl-eyebrow">
            {settings?.tournament_name || 'VSL SEASON 04'}{' '}
            <span style={{ opacity: 0.55 }}>/</span> CONTROL CENTRE
          </div>
          <h1 className="vsl-page-heading">
            Tournament settings<span>.</span>
          </h1>
          <p className="page-subtitle text-xs text-[#c7d6ff] font-semibold mt-1">
            Set the rules. Get ready for kick-off.
          </p>
        </div>
        <div className="vsl-session-chip">
          <div className="session-icon">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="m12 8-3 2 1 4h4l1-4-3-2ZM12 3v2M4.5 8l2 1M4.6 16l2-1M19.4 16l-2-1M19.5 8l-2 1M12 21v-2" />
            </svg>
          </div>
          <div>
            <small>SETTINGS MODE</small>
            <strong>Operator&apos;s seat</strong>
          </div>
        </div>
      </div>

      <SettingsForm settings={settings} />
    </div>
  );
}
