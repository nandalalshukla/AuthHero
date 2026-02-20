import { Request, Response } from 'express';
import { OAuthService } from './oauth.service';
import crypto from 'crypto';

export const loginWithGoogle = (req: Request, res: Response) => {
  // 1. Generate a secure random state
  const state = crypto.randomBytes(32).toString('hex');
  
  // 2. Store state in a secure, short-lived cookie
  res.cookie('oauth_state', state, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'lax', 
    maxAge: 15 * 60 * 1000 // 15 mins
  });

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'].join(' '),
    state
  };

  const qs = new URLSearchParams(options);
  return res.redirect(`${rootUrl}?${qs.toString()}`);
};