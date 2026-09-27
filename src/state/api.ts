import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { MockServer } from '../api/mock/server';
import { HttpApi } from '../api/http';
import type { Api } from '../api/types';

const KEY = 'invoice-mpesa/mock-db/v1';

/**
 * EXPO_PUBLIC_API_URL points the app at the real NestJS API (TDD §6). Without
 * it the app runs against the in-process simulator, including a simulated
 * Daraja, so every screen can be exercised on a phone with no backend.
 */
const baseUrl = process.env.EXPO_PUBLIC_API_URL;
const payBaseUrl = process.env.EXPO_PUBLIC_PAY_URL ?? 'https://pay.invoicempesa.co.ke';

function createApi(): Api {
  if (baseUrl) return new HttpApi(baseUrl, payBaseUrl);
  return new MockServer(
    {
      load: () => AsyncStorage.getItem(KEY),
      save: (json) => AsyncStorage.setItem(KEY, json),
    },
    {
      now: () => new Date(),
      randomBytes: (n) => Crypto.getRandomBytes(n),
      setTimer: (fn, ms) => void setTimeout(fn, ms),
      latencyMs: 250,
      logger: { warn: (m) => console.warn(m), info: () => {} },
      publicBaseUrl: payBaseUrl,
    },
  );
}

export const api: Api = createApi();
