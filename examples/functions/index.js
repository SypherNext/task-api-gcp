// Registers the handler with Google's Functions Framework (lesson 11).
import { http } from '@google-cloud/functions-framework';
import { taskHealth } from './handler.mjs';

http('taskHealth', taskHealth);
