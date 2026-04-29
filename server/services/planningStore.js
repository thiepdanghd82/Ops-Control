/**
 * Planning Store Service
 * File-based JSON persistence for Planning module data
 * Thread-safe with file locking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteFileSync } from './atomicWrite.js';
import { withLock } from '../utils/asyncLock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLANNING_DATA_DIR = path.join(__dirname, '..', 'data', 'planning');

// Ensure data directory exists
if (!fs.existsSync(PLANNING_DATA_DIR)) {
  fs.mkdirSync(PLANNING_DATA_DIR, { recursive: true });
}

// ─── Generic file operations ───

function getFilePath(collection) {
  return path.join(PLANNING_DATA_DIR, `${collection}.json`);
}

function readCollection(collection) {
  const filePath = getFilePath(collection);
  if (!fs.existsSync(filePath)) {
    atomicWriteFileSync(filePath, '[]');
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeCollection(collection, data) {
  const filePath = getFilePath(collection);
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Orders ───

export function getOrders() {
  return readCollection('orders');
}

export function createOrder(order) {
  return withLock('planning:orders', () => {
    const orders = getOrders();
    const nextId = orders.length > 0
      ? Math.max(...orders.map(o => o.id || 0)) + 1
      : 1000;

    const newOrder = {
      id: nextId,
      ...order,
      status: order.status || 'New',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    orders.push(newOrder);
    writeCollection('orders', orders);
    return newOrder;
  });
}

export function updateOrder(id, updates) {
  return withLock('planning:orders', () => {
    const orders = getOrders();
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return null;

    orders[idx] = {
      ...orders[idx],
      ...updates,
      id, // prevent id override
      updatedAt: new Date().toISOString()
    };
    writeCollection('orders', orders);
    return orders[idx];
  });
}

export function deleteOrder(id) {
  return withLock('planning:orders', () => {
    const orders = getOrders();
    const filtered = orders.filter(o => o.id !== id);
    if (filtered.length === orders.length) return false;
    writeCollection('orders', filtered);
    return true;
  });
}

// ─── Work Orders ───

export function getWorkOrders() {
  return readCollection('work_orders');
}

export function createWorkOrder(workOrder) {
  return withLock('planning:work_orders', () => {
    const workOrders = getWorkOrders();
    const nextId = workOrders.length > 0
      ? Math.max(...workOrders.map(wo => wo.id || 0)) + 1
      : 5000;

    const newWO = {
      id: nextId,
      woNumber: `WO-${nextId}`,
      ...workOrder,
      status: 'New',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    workOrders.push(newWO);
    writeCollection('work_orders', workOrders);
    return newWO;
  });
}

export function updateWorkOrder(id, updates) {
  return withLock('planning:work_orders', () => {
    const workOrders = getWorkOrders();
    const idx = workOrders.findIndex(wo => wo.id === id);
    if (idx === -1) return null;

    workOrders[idx] = {
      ...workOrders[idx],
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };
    writeCollection('work_orders', workOrders);
    return workOrders[idx];
  });
}

// ─── WIP Tracking ───

export function getWIPTracking() {
  return readCollection('wip_tracking');
}

export function updateWIP(woId, progress) {
  return withLock('planning:wip_tracking', () => {
    const wip = getWIPTracking();
    const idx = wip.findIndex(w => w.woId === woId);

    const entry = {
      woId,
      ...progress,
      updatedAt: new Date().toISOString()
    };

    if (idx >= 0) {
      wip[idx] = { ...wip[idx], ...entry };
    } else {
      wip.push(entry);
    }

    writeCollection('wip_tracking', wip);
    return wip[idx >= 0 ? idx : wip.length - 1];
  });
}

// ─── Planning Metadata ───

export function getPlanningMeta() {
  const filePath = path.join(PLANNING_DATA_DIR, 'meta.json');
  if (!fs.existsSync(filePath)) {
    const defaultMeta = {
      workCenters: [],
      plannerData: {},
      componentWidths: {},
      lastSync: null
    };
    atomicWriteFileSync(filePath, JSON.stringify(defaultMeta, null, 2));
    return defaultMeta;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function updatePlanningMeta(updates) {
  return withLock('planning:meta', () => {
    const meta = getPlanningMeta();
    const updated = { ...meta, ...updates, lastSync: new Date().toISOString() };
    atomicWriteFileSync(
      path.join(PLANNING_DATA_DIR, 'meta.json'),
      JSON.stringify(updated, null, 2)
    );
    return updated;
  });
}
