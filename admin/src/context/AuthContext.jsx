import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, getAccessToken, onSessionLost, setAccessToken } from '../lib/api';

const AuthContext = createContext(null);

function readToken(token) {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join(''),
      ),
    );
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;
    return {
      id: decoded.sub,
      mobile: decoded.mobile,
      display_name: decoded.display_name,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readToken(getAccessToken()));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let identity = readToken(getAccessToken());
      if (!identity) {
        try {
          identity = readToken(await api.refreshSession());
        } catch {
          identity = null;
        }
      }
      if (!cancelled) {
        setUser(identity);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onSessionLost(() => setUser(null)), []);

  // This panel is for staff. A customer with the right password still
  // gets nothing here, and is told why rather than being dropped on an
  // empty dashboard.
  const login = useCallback(async (mobile, password) => {
    const data = await api.post('/auth/login', { mobile, password });
    const identity = readToken(data.accessToken);
    if (identity?.role !== 'admin') {
      setAccessToken(null);
      const error = new Error('not an admin');
      error.code = 'FORBIDDEN';
      throw error;
    }
    setAccessToken(data.accessToken);
    setUser(identity);
    return identity;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { auth: true });
    } catch {
      // Already gone on the server; the local session still ends.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, isAuthenticated: !!user, login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
