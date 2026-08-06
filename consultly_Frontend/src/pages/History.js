import axios from "axios";
import React, { useEffect, useState } from "react";
import UserTable from "../components/ClientDashbord/UserTable";
import { useDispatch, useSelector } from "react-redux";
import { fetchVoucherData } from "../components/Redux/slices/UserSlices";
import MoneyValue from "../components/Helper/MoneyValue";

const History = () => {
  const userId = localStorage.getItem("client_u_Identity");
  const shopId = localStorage.getItem("shop_o_Identity");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  const { voucherData } = useSelector((state) => state.users);
  useEffect(() => {
    setLoading(true);
    const getUserWalletHistory = async () => {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_HOST}/users/get/wallet-history/${userId}/${shopId}`,
        );
        if (response.data.success === true) {
          setLoading(false);
          setHistory(response.data.data || []);
        } else {
          setLoading(false);
        }
      } catch (error) {
        setLoading(false);
        console.log("error", error);
      }
    };

    getUserWalletHistory();
  }, [userId, shopId]);

  useEffect(() => {
    if (shopId) {
      dispatch(fetchVoucherData(shopId));
    }
  }, [userId, shopId]);


  const columns = [
    {
      label: "Name",
      key: "userId",
      render: (row) => row.userId?.fullname || "-",
    },
    {
      label: "Amount",
      key: "amount",
      render: (row) => (
        <MoneyValue currency={voucherData?.shopCurrency}>
          {row.amount}
        </MoneyValue>
      ),
    },
    {
      label: "Type",
      key: "transactionType",
    },
    {
      label: "Direction",
      key: "direction",
      render: (row) => (
        <span
          className={`badge ${row.direction === "credit" ? "bg-success" : "bg-danger"}`}
        >
          {row.direction}
        </span>
      ),
    },
    {
      label: "Status",
      key: "status",
      render: (row) => (
        <span
          className={`badge ${row.status === "success" ? "bg-success" : "bg-warning"}`}
        >
          {row.status}
        </span>
      ),
    },
    {
      label: "Date",
      key: "createdAt",
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
  ];

  return (
    <UserTable
      title="Wallet History"
      columns={columns}
      data={history}
      loading={loading}
    />
  );
};

export default History;
