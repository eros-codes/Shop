import { Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import PaymentResult from './pages/PaymentResult';
import NotFound from './pages/NotFound';
import AccountLayout from './pages/account/AccountLayout';
import Dashboard from './pages/account/Dashboard';
import Orders from './pages/account/Orders';
import OrderDetail from './pages/account/OrderDetail';
import Addresses from './pages/account/Addresses';
import WalletPage from './pages/account/WalletPage';
import Returns from './pages/account/Returns';
import Favorites from './pages/account/Favorites';
import ChangePassword from './pages/account/ChangePassword';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="products" element={<Products />} />
        <Route path="product/:slug" element={<ProductDetail />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />

        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />

        {/* Where the API redirects after the payment gateway. */}
        <Route path="payment-success" element={<PaymentResult outcome="success" />} />
        <Route path="payment-failed" element={<PaymentResult outcome="failed" />} />
        <Route path="payment-refunded" element={<PaymentResult outcome="refunded" />} />
        <Route path="payment-pending" element={<PaymentResult outcome="pending" />} />

        <Route path="account" element={<AccountLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="returns" element={<Returns />} />
          <Route path="addresses" element={<Addresses />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="password" element={<ChangePassword />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
