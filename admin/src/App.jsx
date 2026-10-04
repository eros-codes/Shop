import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Returns from './pages/Returns';
import Reports from './pages/Reports';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Brands from './pages/Brands';
import Attributes from './pages/Attributes';
import Comments from './pages/Comments';
import Discounts from './pages/Discounts';
import Shipping from './pages/Shipping';
import Users from './pages/Users';
import Wallets from './pages/Wallets';
import AuditLog from './pages/AuditLog';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="returns" element={<Returns />} />
        <Route path="reports" element={<Reports />} />
        <Route path="products" element={<Products />} />
        <Route path="categories" element={<Categories />} />
        <Route path="brands" element={<Brands />} />
        <Route path="attributes" element={<Attributes />} />
        <Route path="comments" element={<Comments />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="shipping" element={<Shipping />} />
        <Route path="users" element={<Users />} />
        <Route path="wallets" element={<Wallets />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
