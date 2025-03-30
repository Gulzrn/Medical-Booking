import React, { useState } from 'react';

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [bookings, setBookings] = useState([]);

  const checkBookings = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setBookings([]);

    try {
      const response = await fetch('http://localhost:3006/api/check-bookings');
      const data = await response.json();

      if (data.success) {
        setResult(`Found ${data.emails.length} booking emails today`);
        setBookings(data.emails);
      } else {
        setError(data.error || 'Failed to fetch emails');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '50px auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center' }}>Email Booking Checker</h1>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <button 
          onClick={checkBookings}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: loading ? '#cccccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Checking...' : 'Check Today\'s Booking Emails'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'red', marginTop: '20px', textAlign: 'center' }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div style={{ color: 'green', marginTop: '20px', textAlign: 'center' }}>
          {result}
        </div>
      )}

      {bookings.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          {bookings.map((booking, index) => (
            <div 
              key={index}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
                backgroundColor: '#f9f9f9'
              }}
            >
              <h3 style={{ margin: '0 0 15px 0' }}>Booking {index + 1}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px' }}>
                <strong>From:</strong>
                <span>{booking.headers?.from?.[0] || 'N/A'}</span>
                
                <strong>Subject:</strong>
                <span>{booking.headers?.subject?.[0] || 'N/A'}</span>
                
                <strong>Client Name:</strong>
                <span>
                  {booking.parsedData.salesforceUrl ? (
                    <a 
                      href={booking.parsedData.salesforceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#007bff', textDecoration: 'none' }}
                    >
                      {booking.parsedData.clientName || `${booking.parsedData.firstName} ${booking.parsedData.lastName}`}
                    </a>
                  ) : (
                    booking.parsedData.clientName || `${booking.parsedData.firstName} ${booking.parsedData.lastName}` || 'N/A'
                  )}
                </span>
                
                <strong>Postal Code:</strong>
                <span>{booking.parsedData.postalCode || 'N/A'}</span>
                
                <strong>Booking Details:</strong>
                <span>{booking.parsedData.bookingDetails || 'N/A'}</span>

                {booking.parsedData.salesforceDetails && (
                  <>
                    <strong>Email:</strong>
                    <span>{booking.parsedData.salesforceDetails.email || 'N/A'}</span>

                    <strong>Date of Birth:</strong>
                    <span>{booking.parsedData.salesforceDetails.dateOfBirth || 'N/A'}</span>

                    <strong>Phone:</strong>
                    <span>{booking.parsedData.salesforceDetails.phone || 'N/A'}</span>

                    <strong>Mailing Address:</strong>
                    <span>
                      {booking.parsedData.salesforceDetails.mailingAddress ? (
                        <>
                          {booking.parsedData.salesforceDetails.mailingAddress.street}<br/>
                          {booking.parsedData.salesforceDetails.mailingAddress.city}<br/>
                          {booking.parsedData.salesforceDetails.mailingAddress.state}<br/>
                          {booking.parsedData.salesforceDetails.mailingAddress.postalCode}<br/>
                          {booking.parsedData.salesforceDetails.mailingAddress.country}
                        </>
                      ) : 'N/A'}
                    </span>
                  </>
                )}

                {booking.parsedData.bookingAttempted && (
                  <>
                    <strong>D4 Booking Status:</strong>
                    <span style={{ 
                      color: booking.parsedData.bookingSuccess ? 'green' : 'red',
                      fontWeight: 'bold'
                    }}>
                      {booking.parsedData.bookingSuccess ? 'Booking Test Successful' : 'Booking Test Failed'}
                      {booking.parsedData.bookingError && (
                        <div style={{ color: 'red', fontSize: '0.9em' }}>
                          Error: {booking.parsedData.bookingError}
                        </div>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App; 