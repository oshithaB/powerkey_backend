const express = require("express");
const initDatabase = require("./DB/initdb");
const cors = require("cors");
const cron = require("node-cron");
const db = require("./DB/db");
const http = require('http');

const app = express();
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

(async () => {
  try {
    await initDatabase(); // Initialize the database
    // console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize the database:", error);
  }
})();

// Cron job to close expired estimates every hour
cron.schedule("0 * * * *", async () => {
  try {
    const [result] = await db.execute(`
      UPDATE estimates
      SET status = 'closed'
      WHERE status = 'pending' 
        AND expiry_date IS NOT NULL 
        AND STR_TO_DATE(expiry_date, '%Y-%m-%d') < NOW()
    `);

    console.log(`Expired estimates updated: ${result.affectedRows}`);

    // Emit event to all connected clients
    if (result.affectedRows > 0 && io) {
      io.to("common_room").emit("expired_estimates_closed", { message: "Some estimates expired" });
    }
  } catch (err) {
    console.error("Error updating expired estimates:", err);
  }
});

const authRoutes = require("./routes/auth");
const companyRoutes = require("./routes/company");
const userRoutes = require("./routes/user");
const roleRoutes = require("./routes/role");
const employeeRoutes = require("./routes/employee");
const vendorRoutes = require("./routes/vendor");
const customerRoutes = require("./routes/customer");
const productcategoryRoutes = require("./routes/product_category");
const productRoutes = require("./routes/product");
const orderRoutes = require("./routes/orders");
const tax_ratesRoutes = require("./routes/tax_rates");
const estimateRoutes = require("./routes/estimates");
const invoiceRoutes = require("./routes/invoice");
const paymentMethodRoutes = require("./routes/paymentMethod");
const exprenseRoutes = require("./routes/expenses");
const reportRoutes = require("./routes/reports");
const chequeRoutes = require("./routes/cheque");
const chartRoutes = require("./routes/charts");
const billRoutes = require("./routes/bill");

app.use(cors({
  origin: 'http://localhost:5173', // Allow frontend origin
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('public/uploads'));
app.use('/Product_Uploads', express.static('Product_Uploads'));

app.use("/api", authRoutes);
app.use("/api", companyRoutes);
app.use("/api", userRoutes);
app.use("/api", roleRoutes);
app.use("/api", employeeRoutes);
app.use("/api", vendorRoutes);
app.use("/api", customerRoutes);
app.use("/api", productcategoryRoutes);
app.use("/api", productRoutes);
app.use("/api", orderRoutes);
app.use("/api", tax_ratesRoutes);
app.use("/api", estimateRoutes);
app.use("/api", invoiceRoutes);
app.use("/api", paymentMethodRoutes);
app.use("/api", exprenseRoutes);
app.use("/api", reportRoutes);
app.use("/api", chequeRoutes);
app.use("/api", chartRoutes);
app.use("/api", billRoutes);

const editingEstimates = {}; // { estimateId: user }
const editingInvoices = {}; // { invoiceId: user }

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.join("common_room");
  console.log("Socket joined common_room", socket.id);
  const commonRoom = io.sockets.adapter.rooms.get("common_room");
  const members = commonRoom ? Array.from(commonRoom) : [];
  console.log("Members in common_room:", members);

  socket.on("start_listening_estimates", () => {
    // Send current locked estimates
    socket.emit("locked_estimates", editingEstimates);
    console.log("Current locked estimates sent to client-socket:", editingEstimates);
  });

  socket.on("start_listening_invoices", () => {
    // Send current locked invoices
    socket.emit("locked_invoices", editingInvoices);
    console.log("Current locked invoices sent to client-socket:", editingInvoices);
  });

  socket.on("start_edit_estimate", ({ estimateId, user }) => {
    socket.estimateId = estimateId; // Store estimateId in socket
    socket.user = user; // Store user in socket
    console.log(`User ${user} started editing estimate ${estimateId}`);
    editingEstimates[estimateId] = user;
    io.to("common_room").emit("locked_estimates", editingEstimates);
    console.log("Sending updated locked estimates to all clients in common_room:", editingEstimates);
  });

  socket.on("stop_edit_estimate", ({ estimateId, user }) => {
    console.log(`stope_edit_estimate event received`);
    delete editingEstimates[estimateId];
    io.to("common_room").emit("locked_estimates", editingEstimates);
    console.log(`User ${user} stopped editing estimate ${estimateId}`);
    console.log("Sending updated locked estimates to all clients in common_room:", editingEstimates);
  });

  socket.on("start_edit_invoice", ({ invoiceId, user }) => {
    socket.invoiceId = invoiceId; // Store invoiceId in socket
    socket.user = user; // Store user in socket
    console.log(`User ${user} started editing invoice ${invoiceId}`);
    editingInvoices[invoiceId] = user;
    io.to("common_room").emit("locked_invoices", editingInvoices);
    console.log("Sending updated locked invoices to all clients in common_room:", editingInvoices);
  });

  socket.on("stop_edit_invoice", ({ invoiceId, user }) => {
    console.log(`stop_edit_invoice event received`);
    delete editingInvoices[invoiceId];
    io.to("common_room").emit("locked_invoices", editingInvoices);
    console.log(`User ${user} stopped editing invoice ${invoiceId}`);
    console.log("Sending updated locked invoices to all clients in common_room:", editingInvoices);
  });

  socket.on("disconnect", () => {
    const estimateId = socket.estimateId;
    const user = socket.user;
    const invoiceId = socket.invoiceId;

    if (estimateId && user && editingEstimates[estimateId] === user) {
      delete editingEstimates[estimateId];
      io.to("common_room").emit("locked_estimates", editingEstimates);
    }

    if (invoiceId && user && editingInvoices[invoiceId] === user) {
      delete editingInvoices[invoiceId];
      io.to("common_room").emit("locked_invoices", editingInvoices);
    }

    socket.leave("common_room");
  });
});


server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
