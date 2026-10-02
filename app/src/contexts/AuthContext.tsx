import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as api from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name: string) => Promise<User>;
  logout: () => void;
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
  const loading = false;

  // Check for existing token on mount
  useEffect(() => {
    const existingToken = api.getAuthToken();
    const existingUser = api.getAuthUser();
    if (existingToken) {
      setToken(existingToken);
    } else {
      setToken(DEFAULT_TOKEN);
    }
    if (existingUser) {
      setUser(existingUser);
    } else {
      setUser(DEFAULT_USER);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  };

  const signup = async (email: string, password: string, name: string) => {
    const result = await api.signup(email, password, name);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  };

  const logout = () => {
    api.logout();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
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
