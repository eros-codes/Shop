import { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { Button, EmptyState, Field } from '../../components/ui/Primitives';

export default function Addresses() {
  const toast = useToast();
  const [addresses, setAddresses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .get('/addresses', { auth: true })
      .then((data) => setAddresses(Array.isArray(data) ? data : (data?.items ?? [])))
      .catch(() => setAddresses([]));
  };

  useEffect(load, []);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api.post(
        '/addresses',
        {
          province: form.get('province'),
          city: form.get('city'),
          address: form.get('address'),
          postal_code: form.get('postal_code'),
          receiver_mobile: form.get('receiver_mobile'),
        },
        { auth: true },
      );
      toast.success('آدرس اضافه شد');
      setShowForm(false);
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/addresses/${id}`, undefined, { auth: true });
      toast.success('آدرس حذف شد');
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="spread">
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>آدرس‌های من</h1>
        <Button variant="soft" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus size={15} />
          آدرس جدید
        </Button>
      </div>

      {showForm ? (
        <form onSubmit={save} className="card card-pad stack">
          <div className="grid auto-grid">
            <Field label="استان">
              <input className="input" name="province" required />
            </Field>
            <Field label="شهر">
              <input className="input" name="city" required />
            </Field>
          </div>
          <Field label="نشانی کامل">
            <textarea className="textarea" name="address" required />
          </Field>
          <div className="grid auto-grid">
            <Field label="کد پستی">
              <input className="input" name="postal_code" inputMode="numeric" maxLength={10} required />
            </Field>
            <Field label="موبایل تحویل‌گیرنده">
              <input className="input" name="receiver_mobile" inputMode="numeric" required />
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={saving}>
            ذخیره آدرس
          </Button>
        </form>
      ) : null}

      {addresses.length === 0 && !showForm ? (
        <div className="card">
          <EmptyState
            icon={<MapPin size={28} />}
            title="هنوز آدرسی ثبت نکرده‌اید"
            description="برای تکمیل خرید حداقل یک آدرس لازم است."
          />
        </div>
      ) : (
        addresses.map((address) => (
          <div className="card card-pad spread" key={address.id}>
            <div>
              <div className="strong small">
                {address.province}، {address.city}
              </div>
              <div className="small muted">{address.address}</div>
              <div className="tiny muted">
                کد پستی {address.postal_code} — {address.receiver_mobile}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => remove(address.id)}>
              <Trash2 size={14} />
              حذف
            </button>
          </div>
        ))
      )}
    </div>
  );
}
