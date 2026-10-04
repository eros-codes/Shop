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

// The access token is a JWT this shop issued, so its payload is the
// quickest way to know who is signed in - no extra round trip before
// the first paint. The profile is refreshed from the API right after.
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

  const loadProfile = useCallback(async (identity) => {
    if (!identity?.id) return;
    try {
      const profile = await api.get(`/users/${identity.id}`, { auth: true });
      setUser((current) => ({ ...current, ...profile }));
    } catch {
      // A profile that will not load is not a reason to sign someone
      // out; what the token says is enough to render the header.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let identity = readToken(getAccessToken());
      if (!identity) {
        // No usable token, but the refresh cookie may still be good -
        // this is what keeps someone signed in across a browser restart.
        try {
          const token = await api.refreshSession();
          identity = readToken(token);
        } catch {
          identity = null;
        }
      }
      if (cancelled) return;
      setUser(identity);
      setReady(true);
      if (identity) void loadProfile(identity);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  useEffect(() => onSessionLost(() => setUser(null)), []);

  const login = useCallback(
    async (mobile, password) => {
      const data = await api.post('/auth/login', { mobile, password });
      setAccessToken(data.accessToken);
      const identity = readToken(data.accessToken);
      setUser(identity);
      void loadProfile(identity);
      return identity;
    },
    [loadProfile],
  );

  const register = useCallback(
    (payload) => api.post('/auth/register', payload),
    [],
  );

  const verifyOtp = useCallback(
    async (mobile, code) => {
      const data = await api.post('/auth/verify-otp', { mobile, code });
      setAccessToken(data.accessToken);
      const identity = readToken(data.accessToken);
      setUser(identity ?? data.user);
      return identity;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { auth: true });
    } catch {
      // Already gone on the server: the local session still goes.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
      login,
      register,
      verifyOtp,
      logout,
      forgotPassword: (mobile) => api.post('/auth/forgot-password', { mobile }),
      resetPassword: (payload) => api.post('/auth/reset-password', payload),
      changePassword: (payload) =>
        api.patch('/auth/password', payload, { auth: true }),
      refreshProfile: () => loadProfile(user),
    }),
    [user, ready, login, register, verifyOtp, logout, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
