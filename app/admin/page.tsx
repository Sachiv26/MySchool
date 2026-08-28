/** Admin landing — redirect to the messages list (review workflow starts there). */
import { redirect } from 'next/navigation';

export default function AdminIndex() {
  redirect('/admin/messages');
}
