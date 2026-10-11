import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  getAccessToken,
  onSessionLost,
  onTokenChange,
  setAccessToken,
} from '../lib/api';

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
    return { id: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

// This panel is for staff. Whatever a token says about anyone else, it
// does not open the panel.
const staffOnly = (identity) => (identity?.role === 'admin' ? identity : null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => staffOnly(readToken(getAccessToken())));
  const [ready, setReady] = useState(false);
  const userRef = useRef(user);
  userRef.current = user;

  // The token carries only the id and role; the name in the top bar comes
  // from the profile. It used to read the token's (absent) name, so the
  // bar showed an empty space beside the "مدیر" badge.
  const loadProfile = useCallback(async (identity) => {
    if (!identity?.id) return;
    try {
      const profile = await api.get(`/users/${identity.id}`, { auth: true });
      setUser((current) =>
        current && String(current.id) === String(identity.id)
          ? { ...current, ...profile }
          : current,
      );
    } catch {
      // Not a reason to sign anyone out; the panel works without a name.
    }
  }, []);

  // A session that is not an admin's is ended on the server too - its
  // refresh cookie would otherwise open the panel's shell on the next
  // visit (see login).
  const endForeignSession = useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { auth: true });
    } catch {
      // Gone already.
    }
    setAccessToken(null);
  }, []);

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
      if (identity && !staffOnly(identity)) {
        await endForeignSession();
        identity = null;
      }
      if (!cancelled) {
        setUser(identity);
        setReady(true);
        if (identity) void loadProfile(identity);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endForeignSession, loadProfile]);

  useEffect(() => onSessionLost(() => setUser(null)), []);

  // Another tab signed out, or in as someone else.
  useEffect(
    () =>
      onTokenChange((token) => {
        const identity = staffOnly(readToken(token));
        if (!identity) {
          setUser(null);
          return;
        }
        if (String(userRef.current?.id) === String(identity.id)) return;
        setUser(identity);
        void loadProfile(identity);
      }),
    [loadProfile],
  );

  // A customer with the right password still gets nothing here, and is
  // told why rather than being dropped on an empty dashboard. The sign-in
  // has already set a refresh cookie for this host by the time the role is
  // known, so the session is ended on the server, not just forgotten here -
  // reloading the page used to bring the customer straight back in.
  const login = useCallback(
    async (mobile, password) => {
      const data = await api.post('/auth/login', { mobile, password });
      const identity = readToken(data.accessToken);
      if (identity?.role !== 'admin') {
        setAccessToken(data.accessToken);
        await endForeignSession();
        const error = new Error('not an admin');
        error.code = 'FORBIDDEN';
        throw error;
      }
      setAccessToken(data.accessToken);
      setUser(identity);
      void loadProfile(identity);
      return identity;
    },
    [endForeignSession, loadProfile],
  );

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
