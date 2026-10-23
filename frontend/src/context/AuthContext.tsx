import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (credential: string) => Promise<void>;
  mockLogin: (email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (credential: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/google`, { credential });
      const { user, token } = response.data;
      setUser(user);
      setToken(token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  };

  const mockLogin = (email: string) => {
    const encodedPayload = btoa(JSON.stringify({ 
      email: email, 
      name: email.split('@')[0],
      picture: null 
    }));
    const mockToken = `header.${encodedPayload}.signature`;
    const mockUser = {
      id: 'mock-id-123',
      email: email,
      name: email.split('@')[0],
      picture: null
    };
    setUser(mockUser);
    setToken(mockToken);
    localStorage.setItem('user', JSON.stringify(mockUser));
    localStorage.setItem('token', mockToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, mockLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
