import { InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export const API_HTTP_CLIENT = new InjectionToken<HttpClient>('API_HTTP_CLIENT');
export const QUERY_HTTP_CLIENT = new InjectionToken<HttpClient>('QUERY_HTTP_CLIENT');