import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as api from '../api/client';
import { currentSession, signOut as cloudSignOut, sendSignInLink, currentWorkspace, type Workspace } from '../cloud';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isCloudUser: boolean;
  workspace: Workspace | null;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name: string) => Promise<User>;
  logout: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USER: User = {
  id: 'local-user',
  email: 'user@local.example.com',
  name: 'Local User'
};

const DEFAULT_TOKEN = 'local-token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
  const [token, setToken] = useState<string | null>(DEFAULT_TOKEN);
  const [isCloudUser, setIsCloudUser] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for cloud session and existing local token on mount
  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      try {
        // Check for Supabase cloud session
        const session = await currentSession();

        if (session) {
          // User is signed in to Supabase
          setIsCloudUser(true);
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User'
          });
          setToken(session.access_token);

          // Get workspace info
          const ws = await currentWorkspace();
          if ('error' in ws) {
            console.error('Failed to load workspace:', ws.error);
          } else {
            setWorkspace(ws);
          }
        } else {
          // No cloud session - use demo mode
          setIsCloudUser(false);
          const existingToken = api.getAuthToken();
          const existingUser = api.getAuthUser();

          if (existingToken && existingUser) {
            setToken(existingToken);
            setUser(existingUser);
          } else {
            setToken(DEFAULT_TOKEN);
            setUser(DEFAULT_USER);
          }
          setWorkspace(null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Fallback to demo mode on error
        setIsCloudUser(false);
        setToken(DEFAULT_TOKEN);
        setUser(DEFAULT_USER);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    setToken(result.token);
    setUser(result.user);
    setIsCloudUser(false);
    return result.user;
  };

  const signup = async (email: string, password: string, name: string) => {
    const result = await api.signup(email, password, name);
    setToken(result.token);
    setUser(result.user);
    setIsCloudUser(false);
    return result.user;
  };

  const signInWithEmail = async (email: string) => {
    return await sendSignInLink(email);
  };

  const logout = async () => {
    if (isCloudUser) {
      await cloudSignOut();
      setIsCloudUser(false);
      setWorkspace(null);
    } else {
      api.logout();
    }
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, isCloudUser, workspace, login, signup, logout, signInWithEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
