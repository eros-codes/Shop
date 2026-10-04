import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/Primitives';

export default function NotFound() {
  return (
    <div className="container page">
      <div className="card">
        <EmptyState
          icon={<Compass size={30} />}
          title="صفحه‌ای که دنبالش بودید پیدا نشد"
          description="ممکن است آدرس اشتباه باشد یا صفحه حذف شده باشد."
          action={
            <Link className="btn btn-primary" to="/">
              بازگشت به خانه
            </Link>
          }
        />
      </div>
    </div>
  );
}
