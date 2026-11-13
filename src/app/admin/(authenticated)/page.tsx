import { redirect } from 'next/navigation';

// /admin → redirect to /admin/settings
export default function AdminIndexPage() {
  redirect('/admin/settings');
}

