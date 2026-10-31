import { createContext, useContext, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  const save = ({ user, token }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  };
  const login = async (email, password) => save(await api('/auth/login', { method: 'POST', body: { email, password } }));
  const signup = async (name, email, password) => save(await api('/auth/signup', { method: 'POST', body: { name, email, password } }));
  const logout = () => { localStorage.clear(); setUser(null); };

  return <AuthContext.Provider value={{ user, login, signup, logout }}>{children}</AuthContext.Provider>;
}
