// Capstone running cost, us-central1 on-demand list prices in USD, November 2026.
// Confirm current rates in the Google Cloud Pricing Calculator before you rely on them.
const HOURS = 730;                       // average hours in a month
const SECONDS = HOURS * 3600;

// Cloud SQL for PostgreSQL, Enterprise edition, db-custom-1-3840 (1 vCPU, 3.75 GB), zonal
const sqlVcpuPerHour = 0.0413;
const sqlGbPerHour = 0.007;
const sqlStoragePerGbMonth = 0.22;       // sources quote 0.17 to 0.22; the higher is used
const sqlBackupPerGbMonth = 0.08;
const vcpus = 1, memoryGb = 3.75, storageGb = 10, backupGb = 1;

// Cloud Run request-based billing, Tier 1 region, after the monthly free tier
const runVcpuSecond = 0.000024, runGibSecond = 0.0000025;
const freeVcpuSeconds = 180000, freeGibSeconds = 360000;   // per billing account
const runVcpu = 1, runGib = 0.5;

const sqlCompute = (vcpus * sqlVcpuPerHour + memoryGb * sqlGbPerHour) * HOURS;
const sqlStorage = storageGb * sqlStoragePerGbMonth + backupGb * sqlBackupPerGbMonth;
// Worst case for the app: one instance busy every second of the month.
const runBusy = Math.max(0, runVcpu * SECONDS - freeVcpuSeconds) * runVcpuSecond
              + Math.max(0, runGib * SECONDS - freeGibSeconds) * runGibSecond;

const usd = n => n.toFixed(2);
console.log(`cloudSqlCompute  ${usd(sqlCompute)} USD/month`);
console.log(`cloudSqlStorage  ${usd(sqlStorage)} USD/month`);
console.log(`cloudRun (light) 0.00 USD/month inside the free tier`);
console.log(`cloudRun (busy)  ${usd(runBusy)} USD/month if one instance never idles`);
console.log(`total (lab use)  ${usd(sqlCompute + sqlStorage)} USD/month`);
console.log(`one day          ${usd((sqlCompute + sqlStorage) / HOURS * 24)} USD`);
